import { beforeEach, expect, test } from "bun:test";
import {
  CannotBook,
  CannotCancel,
  CannotConfirm,
  CannotSetVenue,
  HostingConcept,
  HostLimitReached,
  InvalidDetails,
  InvalidSchedule,
  NotHost,
} from "../src/concepts/Hosting.ts";
import { testDatabase } from "./support/mongo.ts";

// a fixed clock: `at(h)` is h hours after noon on Dec 1
const at = (hours: number) => new Date(Date.UTC(2026, 11, 1, 12 + hours));
// a dinner whose RSVPs close at hour 4 and which runs from hour 6 to hour 8
const dinner = { host: "noah", title: "Break dinner", area: "Kendall Square", cutoffTime: at(4), startTime: at(6), endTime: at(8), now: at(0) };

let h: HostingConcept;
beforeEach(async () => {
  h = new HostingConcept(await testDatabase());
});

/** The status of a gathering, or undefined when there is no such gathering. */
async function status(gathering: string) {
  return (await h._getDetails({ gathering }))[0]?.status;
}

test("principle: a confirmed gathering with a venue is booked and closes when it ends", async () => {
  const { gathering } = await h.create({ ...dinner, details: " Tapas, about $25 ", scope: "" });
  expect(await h._getDetails({ gathering })).toEqual([
    { host: "noah", title: "Break dinner", status: "OPEN", startTime: at(6), endTime: at(8), cutoffTime: at(4), details: "Tapas, about $25", scope: undefined, area: "Kendall Square", confirmedVenue: undefined },
  ]);

  // booking needs a confirmation and a venue first
  await expect(h.markBooked({ gathering, host: "noah" })).rejects.toBeInstanceOf(CannotBook);
  await h.confirm({ gathering, host: "noah", now: at(1) });
  await expect(h.markBooked({ gathering, host: "noah" })).rejects.toBeInstanceOf(CannotBook);
  await h.setVenue({ gathering, confirmedVenue: "Oleana" });
  await h.markBooked({ gathering, host: "noah" });
  expect(await status(gathering)).toBe("BOOKED");

  // it stays booked until its time window ends
  await expect(h.closeEnded({ gathering, now: at(7) })).rejects.toThrow();
  await h.closeEnded({ gathering, now: at(8) });
  expect(await status(gathering)).toBe("CLOSED");
  await expect(h.cancel({ gathering, host: "noah", now: at(9) })).rejects.toBeInstanceOf(CannotCancel);
});

test("an unconfirmed gathering closes after its cutoff", async () => {
  const { gathering } = await h.create(dinner);
  await expect(h.expireUnconfirmed({ gathering, now: at(4) })).rejects.toThrow();
  await expect(h.confirm({ gathering, host: "noah", now: at(5) })).rejects.toBeInstanceOf(CannotConfirm);
  await h.expireUnconfirmed({ gathering, now: at(5) });
  expect(await status(gathering)).toBe("CLOSED");
  await expect(h.setVenue({ gathering, confirmedVenue: "Oleana" })).rejects.toThrow();
});

test("only the host can confirm, book, or cancel", async () => {
  const { gathering } = await h.create({ ...dinner, confirmedVenue: "Oleana" });
  await expect(h.confirm({ gathering, host: "alice", now: at(1) })).rejects.toBeInstanceOf(NotHost);
  await expect(h.markBooked({ gathering, host: "alice" })).rejects.toBeInstanceOf(NotHost);
  await expect(h.cancel({ gathering, host: "alice", now: at(1) })).rejects.toBeInstanceOf(NotHost);
  await expect(h.cancel({ gathering: "nothing", host: "noah", now: at(1) })).rejects.toBeInstanceOf(NotHost);
  expect(await status(gathering)).toBe("OPEN");
  expect(await h._getDetails({ gathering: "nothing" })).toEqual([]);
});

test("a gathering needs a title, an area, and a schedule in order", async () => {
  await expect(h.create({ ...dinner, title: "  " })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.create({ ...dinner, area: "" })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.create({ ...dinner, now: at(4) })).rejects.toBeInstanceOf(InvalidSchedule);
  await expect(h.create({ ...dinner, cutoffTime: at(7) })).rejects.toBeInstanceOf(InvalidSchedule);
  await expect(h.create({ ...dinner, endTime: at(6) })).rejects.toBeInstanceOf(InvalidSchedule);
  await expect(h.create({ ...dinner, startTime: new Date("not a date") })).rejects.toBeInstanceOf(InvalidSchedule);
});

test("a host keeps at most 3 active gatherings, and booking or cancelling one frees a place", async () => {
  const { gathering: first } = await h.create({ ...dinner, confirmedVenue: "Oleana" });
  const { gathering: second } = await h.create(dinner);
  await h.create(dinner);
  await expect(h.create(dinner)).rejects.toBeInstanceOf(HostLimitReached);
  // the limit is per host
  await h.create({ ...dinner, host: "alice" });

  await h.confirm({ gathering: first, host: "noah", now: at(1) });
  await expect(h.create(dinner)).rejects.toBeInstanceOf(HostLimitReached);
  await h.markBooked({ gathering: first, host: "noah" });
  await h.create(dinner);

  await h.cancel({ gathering: second, host: "noah", now: at(1) });
  await h.create(dinner);
  await expect(h.create(dinner)).rejects.toBeInstanceOf(HostLimitReached);
});

test("five creates at once by one host leave exactly 3 gatherings", async () => {
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => h.create(dinner)));
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(3);
  for (const o of outcomes) if (o.status === "rejected") expect(o.reason).toBeInstanceOf(HostLimitReached);
});

test("a host sees all of their own gatherings, latest start first", async () => {
  const { gathering: early } = await h.create(dinner);
  const { gathering: late } = await h.create({ ...dinner, title: "Later dinner", startTime: at(7) });
  await h.create({ ...dinner, host: "alice" });
  await h.cancel({ gathering: early, host: "noah", now: at(1) });

  expect(await h._getHosted({ host: "noah" })).toEqual([
    { gathering: late, title: "Later dinner", status: "OPEN", startTime: at(7) },
    { gathering: early, title: "Break dinner", status: "CANCELLED", startTime: at(6) },
  ]);
  expect(await h._getHosted({ host: "nobody" })).toEqual([]);
});

test("gatherings past their cutoff are the open ones to expire and the confirmed or booked ones to freeze", async () => {
  const { gathering: open } = await h.create(dinner);
  const { gathering: confirmed } = await h.create({ ...dinner, cutoffTime: at(3) });
  const { gathering: booked } = await h.create({ ...dinner, confirmedVenue: "Oleana" });
  const { gathering: cancelled } = await h.create({ ...dinner, host: "alice" });
  await h.confirm({ gathering: confirmed, host: "noah", now: at(1) });
  await h.confirm({ gathering: booked, host: "noah", now: at(1) });
  await h.markBooked({ gathering: booked, host: "noah" });
  await h.cancel({ gathering: cancelled, host: "alice", now: at(1) });

  expect(await h._getPastCutoff({ now: at(2) })).toEqual([]);
  // a confirmed or booked gathering is due at its cutoff, an open one only after it
  expect(await h._getPastCutoff({ now: at(3) })).toEqual([{ gathering: confirmed, status: "CONFIRMED" }]);
  expect(await h._getPastCutoff({ now: at(4) })).toEqual([{ gathering: confirmed, status: "CONFIRMED" }, { gathering: booked, status: "BOOKED" }]);
  const due = await h._getPastCutoff({ now: at(5) });
  expect(due[0]).toEqual({ gathering: confirmed, status: "CONFIRMED" });
  expect(due).toHaveLength(3);
  expect(due).toContainEqual({ gathering: booked, status: "BOOKED" });
  expect(due).toContainEqual({ gathering: open, status: "OPEN" });

  // expiring the open one takes it off the list
  await h.expireUnconfirmed({ gathering: open, now: at(5) });
  expect(await h._getPastCutoff({ now: at(5) })).toHaveLength(2);
});

test("ended gatherings are the confirmed and booked ones past their end, earliest end first", async () => {
  const { gathering: open } = await h.create(dinner);
  const { gathering: confirmed } = await h.create({ ...dinner, endTime: at(9) });
  const { gathering: booked } = await h.create({ ...dinner, confirmedVenue: "Oleana" });
  await h.confirm({ gathering: confirmed, host: "noah", now: at(1) });
  await h.confirm({ gathering: booked, host: "noah", now: at(1) });
  await h.markBooked({ gathering: booked, host: "noah" });

  expect(await h._getEnded({ now: at(7) })).toEqual([]);
  expect(await h._getEnded({ now: at(8) })).toEqual([{ gathering: booked }]);
  expect(await h._getEnded({ now: at(9) })).toEqual([{ gathering: booked }, { gathering: confirmed }]);

  // closing one takes it off the list, and an open gathering is never on it
  await h.closeEnded({ gathering: booked, now: at(9) });
  expect(await h._getEnded({ now: at(9) })).toEqual([{ gathering: confirmed }]);
  expect(await status(open)).toBe("OPEN");
});

test("create enforces trimmed field length bounds before schedule and host limit checks", async () => {
  const { gathering } = await h.create({
    ...dinner,
    title: `  ${"t".repeat(100)}  `,
    area: `  ${"a".repeat(100)}  `,
    scope: `  ${"s".repeat(100)}  `,
    confirmedVenue: `  ${"v".repeat(100)}  `,
    details: `  ${"d".repeat(300)}  `,
  });
  expect(await h._getDetails({ gathering })).toEqual([
    {
      host: "noah",
      title: "t".repeat(100),
      status: "OPEN",
      startTime: at(6),
      endTime: at(8),
      cutoffTime: at(4),
      details: "d".repeat(300),
      scope: "s".repeat(100),
      area: "a".repeat(100),
      confirmedVenue: "v".repeat(100),
    },
  ]);

  // over-limit fields refuse InvalidDetails with no DB mutations
  await expect(h.create({ ...dinner, title: "t".repeat(101) })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.create({ ...dinner, area: "a".repeat(101) })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.create({ ...dinner, scope: "s".repeat(101) })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.create({ ...dinner, confirmedVenue: "v".repeat(101) })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.create({ ...dinner, details: "d".repeat(301) })).rejects.toBeInstanceOf(InvalidDetails);
  expect(await h._getHosted({ host: "noah" })).toHaveLength(1);

  // InvalidDetails takes precedence over InvalidSchedule
  await expect(h.create({ ...dinner, title: "t".repeat(101), now: at(5) })).rejects.toBeInstanceOf(InvalidDetails);

  // InvalidDetails takes precedence over HostLimitReached
  await h.create(dinner);
  await h.create(dinner);
  await expect(h.create(dinner)).rejects.toBeInstanceOf(HostLimitReached);
  await expect(h.create({ ...dinner, details: "d".repeat(301) })).rejects.toBeInstanceOf(InvalidDetails);
  expect(await h._getHosted({ host: "noah" })).toHaveLength(3);
});

test("setVenue enforces non-empty trimmed length up to 100 characters", async () => {
  const { gathering } = await h.create({ ...dinner, confirmedVenue: "Oleana" });

  await expect(h.setVenue({ gathering, confirmedVenue: "" })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.setVenue({ gathering, confirmedVenue: "   " })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.setVenue({ gathering, confirmedVenue: "v".repeat(101) })).rejects.toBeInstanceOf(InvalidDetails);
  expect((await h._getDetails({ gathering }))[0]?.confirmedVenue).toBe("Oleana");

  await expect(h.setVenue({ gathering, confirmedVenue: `  ${"v".repeat(100)}  ` })).resolves.toEqual({});
  expect((await h._getDetails({ gathering }))[0]?.confirmedVenue).toBe("v".repeat(100));
});

test("setVenue succeeds on OPEN and CONFIRMED gatherings and refuses missing, BOOKED, CLOSED, or CANCELLED gatherings", async () => {
  const { gathering: openG } = await h.create(dinner);
  expect(await h.setVenue({ gathering: openG, confirmedVenue: "  Sarma  " })).toEqual({});
  expect((await h._getDetails({ gathering: openG }))[0]?.confirmedVenue).toBe("Sarma");

  // Works on CONFIRMED gatherings too
  await h.confirm({ gathering: openG, host: "noah", now: at(1) });
  expect(await h.setVenue({ gathering: openG, confirmedVenue: "Oleana" })).toEqual({});
  expect((await h._getDetails({ gathering: openG }))[0]?.confirmedVenue).toBe("Oleana");

  // Refuses BOOKED gatherings without mutating confirmedVenue
  await h.markBooked({ gathering: openG, host: "noah" });
  await expect(h.setVenue({ gathering: openG, confirmedVenue: "Pammy's" })).rejects.toBeInstanceOf(CannotSetVenue);
  expect((await h._getDetails({ gathering: openG }))[0]?.confirmedVenue).toBe("Oleana");

  // Refuses CLOSED gatherings without mutating confirmedVenue
  await h.closeEnded({ gathering: openG, now: at(8) });
  await expect(h.setVenue({ gathering: openG, confirmedVenue: "Pammy's" })).rejects.toBeInstanceOf(CannotSetVenue);
  expect((await h._getDetails({ gathering: openG }))[0]?.confirmedVenue).toBe("Oleana");

  // Refuses expired OPEN gatherings (CLOSED)
  const { gathering: expiredG } = await h.create(dinner);
  await h.expireUnconfirmed({ gathering: expiredG, now: at(5) });
  await expect(h.setVenue({ gathering: expiredG, confirmedVenue: "Oleana" })).rejects.toBeInstanceOf(CannotSetVenue);
  expect((await h._getDetails({ gathering: expiredG }))[0]?.confirmedVenue).toBeUndefined();

  // Refuses CANCELLED gatherings without mutating confirmedVenue
  const { gathering: cancelledG } = await h.create({ ...dinner, confirmedVenue: "Initial" });
  await h.cancel({ gathering: cancelledG, host: "noah", now: at(1) });
  await expect(h.setVenue({ gathering: cancelledG, confirmedVenue: "Updated" })).rejects.toBeInstanceOf(CannotSetVenue);
  expect((await h._getDetails({ gathering: cancelledG }))[0]?.confirmedVenue).toBe("Initial");

  // Refuses missing gatherings
  await expect(h.setVenue({ gathering: "missing-id", confirmedVenue: "Oleana" })).rejects.toBeInstanceOf(CannotSetVenue);

  // InvalidDetails takes precedence over CannotSetVenue
  await expect(h.setVenue({ gathering: "missing-id", confirmedVenue: "   " })).rejects.toBeInstanceOf(InvalidDetails);
  await expect(h.setVenue({ gathering: openG, confirmedVenue: "v".repeat(101) })).rejects.toBeInstanceOf(InvalidDetails);
});
