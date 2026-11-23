import { beforeEach, expect, test } from "bun:test";
import { assembleApplication } from "../src/assembly.ts";
import { sweepCutoffs } from "../src/cutoffs.ts";
import { testDatabase } from "./support/mongo.ts";

// a fixed clock: `at(h)` is h hours after noon on Dec 1
const at = (hours: number) => new Date(Date.UTC(2026, 11, 1, 12 + hours));
// a dinner whose RSVPs close at hour 4 and which runs from hour 6 to hour 8
const dinner = { host: "noah", title: "Break dinner", area: "Kendall Square", cutoffTime: at(4), startTime: at(6), endTime: at(8), now: at(0) };

let app: ReturnType<typeof assembleApplication>;
beforeEach(async () => {
  app = assembleApplication({ database: await testDatabase() });
});

/** Returns a new gathering with a pool of 2 guest spots, made at hour 0. */
async function table(input: Partial<typeof dinner> & { confirmedVenue?: string } = {}) {
  const result = await app.concepts.Hosting.create({ ...dinner, ...input });
  if ("error" in result) throw new Error(result.error);
  await app.concepts.Reserving.openPool({ resource: result.gathering, capacity: 2 });
  return result.gathering;
}

/** Returns the status of a gathering and whether its pool is locked. */
async function state(gathering: string) {
  const [details] = await app.concepts.Hosting._getDetails({ gathering });
  const pools = await app.concepts.Reserving._getAvailability({ resource: gathering });
  return { status: details.status, locked: pools.at(0)?.locked };
}

test("nothing changes before the cutoff", async () => {
  const gathering = await table();
  await sweepCutoffs(app, at(3));
  expect(await state(gathering)).toEqual({ status: "OPEN", locked: false });
});

test("an unconfirmed table closes after its cutoff, which frees the host's place", async () => {
  const gathering = await table();
  await table();
  await table();
  expect(await app.concepts.Hosting.create(dinner)).toMatchObject({ error: "HOST_LIMIT_REACHED" });

  // at the cutoff itself the host can still confirm, so nothing happens yet
  await sweepCutoffs(app, at(4));
  expect(await state(gathering)).toEqual({ status: "OPEN", locked: false });
  await sweepCutoffs(app, at(5));
  expect(await state(gathering)).toEqual({ status: "CLOSED", locked: true });
  expect(await app.concepts.Hosting.create({ ...dinner, cutoffTime: at(7), startTime: at(8), endTime: at(9), now: at(5) })).toHaveProperty("gathering");
});

test("a confirmed table keeps its status at the cutoff, and its seats freeze", async () => {
  const gathering = await table();
  await app.concepts.Hosting.confirm({ gathering, host: "noah", now: at(1) });
  const seat = await app.concepts.Reserving.claim({ resource: gathering, user: "ana" });
  if ("error" in seat) throw new Error(seat.error);

  await sweepCutoffs(app, at(4));
  expect(await state(gathering)).toEqual({ status: "CONFIRMED", locked: true });
  // the headcount no longer changes in either direction
  expect(await app.concepts.Reserving.cancel({ reservation: seat.reservation! })).toMatchObject({ error: "CANNOT_CANCEL" });
  expect(await app.concepts.Reserving.claim({ resource: gathering, user: "ben" })).toMatchObject({ error: "POOL_CLOSED" });
});

test("a table booked before its cutoff freezes at the cutoff too", async () => {
  const gathering = await table({ confirmedVenue: "Oleana" });
  await app.concepts.Hosting.confirm({ gathering, host: "noah", now: at(1) });
  await app.concepts.Hosting.markBooked({ gathering, host: "noah" });
  await sweepCutoffs(app, at(3));
  expect(await state(gathering)).toEqual({ status: "BOOKED", locked: false });
  await sweepCutoffs(app, at(4));
  expect(await state(gathering)).toEqual({ status: "BOOKED", locked: true });
});

test("confirmed and booked tables close when they end", async () => {
  const confirmed = await table();
  const booked = await table({ confirmedVenue: "Oleana" });
  for (const gathering of [confirmed, booked]) await app.concepts.Hosting.confirm({ gathering, host: "noah", now: at(1) });
  await app.concepts.Hosting.markBooked({ gathering: booked, host: "noah" });

  await sweepCutoffs(app, at(7));
  expect(await state(confirmed)).toEqual({ status: "CONFIRMED", locked: true });
  await sweepCutoffs(app, at(8));
  expect(await state(confirmed)).toEqual({ status: "CLOSED", locked: true });
  expect(await state(booked)).toEqual({ status: "CLOSED", locked: true });
});

test("a sweep after a long gap catches up in one pass, and a second sweep changes nothing", async () => {
  const unconfirmed = await table();
  const confirmed = await table();
  await app.concepts.Hosting.confirm({ gathering: confirmed, host: "noah", now: at(1) });

  await sweepCutoffs(app, at(100));
  const after = [await state(unconfirmed), await state(confirmed)];
  expect(after).toEqual([{ status: "CLOSED", locked: true }, { status: "CLOSED", locked: true }]);
  await sweepCutoffs(app, at(100));
  expect([await state(unconfirmed), await state(confirmed)]).toEqual(after);
});

test("a table with no pool does not stop the rest of the sweep", async () => {
  // made without a pool, which the create endpoint never does
  const broken = await app.concepts.Hosting.create({ ...dinner, cutoffTime: at(3) });
  if ("error" in broken) throw new Error(broken.error);
  const gathering = await table();

  await sweepCutoffs(app, at(5));
  expect(await state(broken.gathering)).toEqual({ status: "CLOSED", locked: undefined });
  expect(await state(gathering)).toEqual({ status: "CLOSED", locked: true });
});
