import { afterAll, beforeEach, expect, test } from "bun:test";
import { createHttpClient, type HttpClientError } from "@mit-sdg/sync-engine-http/client";
import type { Client } from "@mit-sdg/sync-engine/client";
import type { Db } from "mongodb";
import type { AppWireHttp } from "../generated/wire.ts";
import { AuthenticatingConcept } from "../src/concepts/Authenticating.ts";
import { HostingConcept } from "../src/concepts/Hosting.ts";
import { InvitingConcept } from "../src/concepts/Inviting.ts";
import { ReservingConcept } from "../src/concepts/Reserving.ts";
import { SessioningConcept } from "../src/concepts/Sessioning.ts";
import { startHost } from "../src/host.ts";
import { testDatabase } from "./support/mongo.ts";

let server: ReturnType<typeof startHost> | undefined;
let client: Client<AppWireHttp, HttpClientError>;
let database: Db;

// starting the in-memory MongoDB can take a few seconds on the first test
beforeEach(async () => {
  // these tests sign in through test-login, which only runs when switched on outside production
  process.env.ENABLE_TEST_LOGIN = "true";
  process.env.NODE_ENV = "test";
  server?.stop(true);
  database = await testDatabase();
  server = startHost({ hostname: "127.0.0.1", port: 0, database });
  client = createHttpClient<AppWireHttp>({ baseUrl: `http://127.0.0.1:${server.port}/` });
}, 30_000);

afterAll(() => {
  server?.stop(true);
});

/** Signs a user in directly through the concepts, sharing the server's database, and returns their session. */
async function signIn(email: string) {
  const { user } = await new AuthenticatingConcept(database).authenticate({ externalId: email, email });
  const { session } = await new SessioningConcept(database).start({ subject: user, lifetime: 60 * 60_000, now: new Date() });
  return { user, session };
}

// times relative to now, so the cutoff is always in the future
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60_000).toISOString();
const dinner = {
  title: "Thanksgiving dinner",
  area: "Central Square",
  cutoffTime: hoursFromNow(24),
  startTime: hoursFromNow(48),
  endTime: hoursFromNow(50),
  capacity: 5,
};

/** Creates a table and fails the test with the error if that was refused. */
async function createTable(session: string, extra: Record<string, unknown> = {}) {
  const created = await client.api.tables.create({ session, ...dinner, ...extra });
  if ("error" in created) throw new Error(`create refused: ${created.error}`);
  return created;
}

test("a host creates a table, and anyone with its link sees the details and open seats without signing in", async () => {
  const noah = await signIn("noah@mit.edu");
  const created = await createTable(noah.session, { details: "Everyone pays for their own meal", linkLabel: "Dorm list" });
  expect(created.token.length).toBeGreaterThan(20);

  const view = await client.api.tables.view({ token: created.token });
  if ("error" in view) throw new Error(view.error);
  expect(view.gathering).toBe(created.gathering);
  expect(view.title).toBe("Thanksgiving dinner");
  expect(view.area).toBe("Central Square");
  expect(view.details).toBe("Everyone pays for their own meal");
  expect(view.status).toBe("OPEN");
  expect(new Date(view.startTime as unknown as string).toISOString()).toBe(dinner.startTime);
  expect(view.capacity).toBe(5);
  expect(view.remaining).toBe(5);
  expect(view.reservedCount).toBe(0);
  expect(view.waitlistCount).toBe(0);
  expect(view.locked).toBe(false);
});

test("creating a table needs an active session", async () => {
  expect(await client.api.tables.create({ session: "not-a-session", ...dinner })).toEqual({ error: "UNAUTHORIZED" });
});

test("a made-up token shows nothing", async () => {
  expect(await client.api.tables.view({ token: "not-a-real-token" })).toEqual({ error: "NOT_FOUND" });
});

test("a capacity that is not a whole number from 1 to 50 is refused and creates nothing", async () => {
  const noah = await signIn("noah@mit.edu");
  for (const capacity of [0, -1, 2.5, 51]) {
    expect(await client.api.tables.create({ session: noah.session, ...dinner, capacity })).toEqual({ error: "INVALID_REQUEST" });
  }
  const mine = await client.api.tables.mine({ session: noah.session });
  if ("error" in mine) throw new Error(mine.error);
  expect(mine.hosted.tables).toEqual([]);
});

test("a missing title or an out-of-order schedule is refused", async () => {
  const noah = await signIn("noah@mit.edu");
  expect(await client.api.tables.create({ session: noah.session, ...dinner, title: "  " })).toEqual({ error: "INVALID_REQUEST" });
  expect(await client.api.tables.create({ session: noah.session, ...dinner, startTime: dinner.endTime, endTime: dinner.startTime })).toEqual({
    error: "INVALID_REQUEST",
  });
  expect(await client.api.tables.create({ session: noah.session, ...dinner, cutoffTime: "not a time" })).toEqual({ error: "INVALID_REQUEST" });
});

test("oversized gathering fields or linkLabel are refused on table create without consuming a host slot", async () => {
  const noah = await signIn("noah@mit.edu");
  const overLimitInputs = [
    { linkLabel: "l".repeat(81) },
    { title: "t".repeat(101) },
    { area: "a".repeat(101) },
    { confirmedVenue: "v".repeat(101) },
    { details: "d".repeat(301) },
  ];
  for (const extra of overLimitInputs) {
    expect(await client.api.tables.create({ session: noah.session, ...dinner, ...extra })).toEqual({ error: "INVALID_REQUEST" });
  }

  const longDomain = `${"s".repeat(97)}.edu`;
  const longScopeHost = await signIn(`host@${longDomain}`);
  expect(await client.api.tables.create({ session: longScopeHost.session, ...dinner, scope: longDomain })).toEqual({
    error: "INVALID_REQUEST",
  });

  const mine = await client.api.tables.mine({ session: noah.session });
  if ("error" in mine) throw new Error(mine.error);
  expect(mine.hosted.tables).toEqual([]);

  // none of the refusals consumed any of the host's 3 active slots, and trimmed boundary lengths succeed
  for (let i = 0; i < 3; i++) {
    await createTable(noah.session, {
      title: `  ${"t".repeat(100)}  `,
      area: `  ${"a".repeat(100)}  `,
      details: `  ${"d".repeat(300)}  `,
      linkLabel: `  ${"l".repeat(80)}  `,
    });
  }
});

test("a fourth active table by the same host is refused", async () => {
  const noah = await signIn("noah@mit.edu");
  for (let i = 0; i < 3; i++) await createTable(noah.session);
  expect(await client.api.tables.create({ session: noah.session, ...dinner })).toEqual({ error: "CONFLICT" });
});

test("a host can only scope a table to their own email domain", async () => {
  const noah = await signIn("noah@mit.edu");
  expect(await client.api.tables.create({ session: noah.session, ...dinner, scope: "harvard.edu" })).toEqual({ error: "FORBIDDEN" });

  const scoped = await createTable(noah.session, { scope: "mit.edu" });
  const view = await client.api.tables.view({ token: scoped.token });
  if ("error" in view) throw new Error(view.error);
  expect(view.scope).toBe("mit.edu");
});

test("a host lists their own tables, latest start first", async () => {
  const noah = await signIn("noah@mit.edu");
  const sooner = await createTable(noah.session, { title: "Sooner" });
  const later = await createTable(noah.session, { title: "Later", startTime: hoursFromNow(70), endTime: hoursFromNow(72) });
  const alice = await signIn("alice@mit.edu");
  await createTable(alice.session, { title: "Alice's" });

  const mine = await client.api.tables.mine({ session: noah.session });
  if ("error" in mine) throw new Error(mine.error);
  expect(mine.hosted.tables.map((t) => [t.gathering, t.title, t.status])).toEqual([
    [later.gathering, "Later", "OPEN"],
    [sooner.gathering, "Sooner", "OPEN"],
  ]);
});

test("a host adds a labeled link per channel and revokes one without breaking the others", async () => {
  const noah = await signIn("noah@mit.edu");
  const created = await createTable(noah.session, { linkLabel: "Dorm list" });
  const club = await client.api.links.create({ session: noah.session, gathering: created.gathering, label: "Club chat" });
  if ("error" in club) throw new Error(club.error);

  const listed = await client.api.links.list({ session: noah.session, gathering: created.gathering });
  if ("error" in listed) throw new Error(listed.error);
  expect(listed.shared.links.map((l) => [l.label, l.active])).toEqual([
    ["Dorm list", true],
    ["Club chat", true],
  ]);

  expect(await client.api.links.revoke({ session: noah.session, link: created.link })).toEqual({ revoked: true });
  expect(await client.api.tables.view({ token: created.token })).toEqual({ error: "NOT_FOUND" });
  const stillOpen = await client.api.tables.view({ token: club.token });
  expect("error" in stillOpen).toBe(false);

  const after = await client.api.links.list({ session: noah.session, gathering: created.gathering });
  if ("error" in after) throw new Error(after.error);
  expect(after.shared.links.map((l) => [l.label, l.active])).toEqual([
    ["Club chat", true],
    ["Dorm list", false],
  ]);
});

test("only the host can add, list, or revoke a table's links", async () => {
  const noah = await signIn("noah@mit.edu");
  const created = await createTable(noah.session);
  const alice = await signIn("alice@mit.edu");

  expect(await client.api.links.create({ session: alice.session, gathering: created.gathering, label: "Sneaky" })).toEqual({ error: "NOT_FOUND" });
  expect(await client.api.links.list({ session: alice.session, gathering: created.gathering })).toEqual({ error: "NOT_FOUND" });
  expect(await client.api.links.revoke({ session: alice.session, link: created.link })).toEqual({ error: "FORBIDDEN" });
  expect(await client.api.links.create({ session: noah.session, gathering: "no-such-table" })).toEqual({ error: "NOT_FOUND" });

  // the refused revoke left the link working
  expect("error" in (await client.api.tables.view({ token: created.token }))).toBe(false);
});

test("creating a share link refuses labels over 80 trimmed characters and allows up to 80", async () => {
  const noah = await signIn("noah@mit.edu");
  const created = await createTable(noah.session, { linkLabel: "Initial" });

  expect(await client.api.links.create({ session: noah.session, gathering: created.gathering, label: "x".repeat(81) })).toEqual({
    error: "INVALID_REQUEST",
  });

  const maxLabel = "y".repeat(80);
  const ok = await client.api.links.create({ session: noah.session, gathering: created.gathering, label: `  ${maxLabel}  ` });
  if ("error" in ok) throw new Error(ok.error);

  const listed = await client.api.links.list({ session: noah.session, gathering: created.gathering });
  if ("error" in listed) throw new Error(listed.error);
  expect(listed.shared.links.map((l) => l.label)).toEqual(["Initial", maxLabel]);
});

test("a host can reactivate a revoked link, restoring view and accept while keeping non-creators and bad sessions refused", async () => {
  const noah = await signIn("noah@mit.edu");
  const alice = await signIn("alice@mit.edu");
  const ana = await signIn("ana@mit.edu");
  const created = await createTable(noah.session, { linkLabel: "Dorm list" });

  expect(await client.api.links.revoke({ session: noah.session, link: created.link })).toEqual({ revoked: true });
  expect(await client.api.tables.view({ token: created.token })).toEqual({ error: "NOT_FOUND" });
  expect(await client.api.tables.accept({ session: ana.session, token: created.token })).toEqual({ error: "NOT_FOUND" });

  // non-creators, unknown links, and invalid sessions are refused without turning the link back on
  expect(await client.api.links.activate({ session: alice.session, link: created.link })).toEqual({ error: "FORBIDDEN" });
  expect(await client.api.links.activate({ session: noah.session, link: "no-such-link" })).toEqual({ error: "FORBIDDEN" });
  expect(await client.api.links.activate({ session: "not-a-session", link: created.link })).toEqual({ error: "UNAUTHORIZED" });
  expect(await client.api.tables.view({ token: created.token })).toEqual({ error: "NOT_FOUND" });

  // the creator reactivates the link (idempotently), restoring view, accept, and active listing
  expect(await client.api.links.activate({ session: noah.session, link: created.link })).toEqual({ activated: true });
  expect(await client.api.links.activate({ session: noah.session, link: created.link })).toEqual({ activated: true });

  const listed = await client.api.links.list({ session: noah.session, gathering: created.gathering });
  if ("error" in listed) throw new Error(listed.error);
  expect(listed.shared.links.map((l) => [l.label, l.active])).toEqual([["Dorm list", true]]);

  const view = await client.api.tables.view({ token: created.token });
  if ("error" in view) throw new Error(view.error);
  expect(view.gathering).toBe(created.gathering);
  expect(typeof (await accept(ana.session, created.token)).reservation).toBe("string");
});

/** Accepts a table by its token and fails the test with the error if that was refused. */
async function accept(session: string, token: string) {
  const accepted = await client.api.tables.accept({ session, token });
  if ("error" in accepted) throw new Error(`accept refused: ${accepted.error}`);
  return { gathering: accepted.gathering, ...accepted.place };
}

test("guests who accept get a seat until the table is full, then a waitlist place", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session, { capacity: 2 });
  const [ana, ben, cal] = await Promise.all(["ana@mit.edu", "ben@mit.edu", "cal@mit.edu"].map(signIn));

  const first = await accept(ana!.session, table.token);
  expect(first.gathering).toBe(table.gathering);
  expect(typeof first.reservation).toBe("string");
  expect(first.position).toBeNull();
  expect(typeof (await accept(ben!.session, table.token)).reservation).toBe("string");
  const third = await accept(cal!.session, table.token);
  expect(third.reservation).toBeNull();
  expect(third.position).toBe(1);

  const view = await client.api.tables.view({ token: table.token });
  if ("error" in view) throw new Error(view.error);
  expect([view.remaining, view.reservedCount, view.waitlistCount]).toEqual([0, 2, 1]);
});

test("accepting the same table twice is refused", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session);
  const ana = await signIn("ana@mit.edu");
  await accept(ana.session, table.token);
  expect(await client.api.tables.accept({ session: ana.session, token: table.token })).toEqual({ error: "CONFLICT" });
});

test("when a seated guest withdraws, the first waitlisted guest gets the seat, and the guest can accept again", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session, { capacity: 1 });
  const ana = await signIn("ana@mit.edu");
  const ben = await signIn("ben@mit.edu");
  await accept(ana.session, table.token);
  expect((await accept(ben.session, table.token)).position).toBe(1);

  expect(await client.api.tables.withdraw({ session: ana.session, gathering: table.gathering })).toEqual({ withdrawn: true });
  const reserving = new ReservingConcept(database);
  expect(await reserving._getReservedUsers({ resource: table.gathering })).toEqual([{ user: ben.user }]);

  // re-accepting after a withdrawal works; the table is full again, so ana waits this time
  expect((await accept(ana.session, table.token)).position).toBe(1);
});

test("a waitlisted guest can withdraw, and withdrawing without having accepted is refused", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session, { capacity: 1 });
  const ana = await signIn("ana@mit.edu");
  const ben = await signIn("ben@mit.edu");
  await accept(ana.session, table.token);
  await accept(ben.session, table.token);

  expect(await client.api.tables.withdraw({ session: ben.session, gathering: table.gathering })).toEqual({ withdrawn: true });
  const view = await client.api.tables.view({ token: table.token });
  if ("error" in view) throw new Error(view.error);
  expect(view.waitlistCount).toBe(0);

  expect(await client.api.tables.withdraw({ session: ben.session, gathering: table.gathering })).toEqual({ error: "CONFLICT" });
  const cal = await signIn("cal@mit.edu");
  expect(await client.api.tables.withdraw({ session: cal.session, gathering: table.gathering })).toEqual({ error: "CONFLICT" });
});

test("a cancelled table, a table past its cutoff, locked seats, the host's own table, and a scope mismatch are all refused", async () => {
  const noah = await signIn("noah@mit.edu");
  const ana = await signIn("ana@mit.edu");
  const hosting = new HostingConcept(database);

  const cancelled = await createTable(noah.session);
  await hosting.cancel({ gathering: cancelled.gathering, host: noah.user, now: new Date() });
  expect(await client.api.tables.accept({ session: ana.session, token: cancelled.token })).toEqual({ error: "CONFLICT" });

  // the cutoff ticker isn't built yet, so the table is still OPEN, but its cutoff has passed
  const expired = await createTable(noah.session);
  await database.collection<{ _id: string }>("hosting.gatherings").updateOne({ _id: expired.gathering }, { $set: { cutoffTime: new Date(Date.now() - 60_000) } });
  expect(await client.api.tables.accept({ session: ana.session, token: expired.token })).toEqual({ error: "CONFLICT" });

  const locked = await createTable(noah.session);
  await new ReservingConcept(database).lock({ resource: locked.gathering });
  expect(await client.api.tables.accept({ session: ana.session, token: locked.token })).toEqual({ error: "CONFLICT" });

  expect(await client.api.tables.accept({ session: noah.session, token: locked.token })).toEqual({ error: "CONFLICT" });

  const alice = await signIn("alice@mit.edu");
  const scoped = await createTable(alice.session, { scope: "mit.edu" });
  const wen = await signIn("wen@wellesley.edu");
  expect(await client.api.tables.accept({ session: wen.session, token: scoped.token })).toEqual({ error: "FORBIDDEN" });
  expect(typeof (await accept(ana.session, scoped.token)).reservation).toBe("string");

  // none of the refusals left an acceptance behind
  const inviting = new InvitingConcept(database);
  for (const table of [cancelled, expired, locked]) {
    expect(await inviting._isAccepted({ event: table.gathering, guest: ana.user })).toEqual({ accepted: false });
  }
  expect(await inviting._isAccepted({ event: scoped.gathering, guest: wen.user })).toEqual({ accepted: false });
});

test("accepting needs an active session and a live link", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session);
  expect(await client.api.tables.accept({ session: "not-a-session", token: table.token })).toEqual({ error: "UNAUTHORIZED" });
  const ana = await signIn("ana@mit.edu");
  expect(await client.api.tables.accept({ session: ana.session, token: "not-a-real-token" })).toEqual({ error: "NOT_FOUND" });
});

test("once seats are locked, a seated or waitlisted guest can no longer withdraw", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session, { capacity: 1 });
  const ana = await signIn("ana@mit.edu");
  const ben = await signIn("ben@mit.edu");
  await accept(ana.session, table.token);
  await accept(ben.session, table.token);
  await new ReservingConcept(database).lock({ resource: table.gathering });

  expect(await client.api.tables.withdraw({ session: ana.session, gathering: table.gathering })).toEqual({ error: "CONFLICT" });
  expect(await client.api.tables.withdraw({ session: ben.session, gathering: table.gathering })).toEqual({ error: "CONFLICT" });
  const inviting = new InvitingConcept(database);
  expect(await inviting._isAccepted({ event: table.gathering, guest: ana.user })).toEqual({ accepted: true });
  expect(await inviting._isAccepted({ event: table.gathering, guest: ben.user })).toEqual({ accepted: true });
});

test("ten guests accepting a 3-seat table at once end up as exactly 3 seated and 7 waitlisted", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session, { capacity: 3 });
  const guests = await Promise.all(Array.from({ length: 10 }, (_, i) => signIn(`guest${i}@mit.edu`)));

  const results = await Promise.all(guests.map((g) => accept(g.session, table.token)));
  expect(results.filter((r) => r.reservation).length).toBe(3);
  expect(results.map((r) => r.position).filter((p) => p !== null).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test("a signed-out guest's accept survives login through returnTo", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session);

  // the table page sends a signed-out guest to login with this path, and finishes the accept when they land back on it
  const returnTo = `/t/${table.token}?accept=1`;
  const login = await client.auth["test-login"]({ returnTo });
  if ("error" in login) throw new Error(login.error);
  expect(login.returnTo).toBe(returnTo);
  expect(typeof (await accept(login.session, table.token)).reservation).toBe("string");
});

test("a viewer can check whether they host a table and where they stand at it", async () => {
  const noah = await signIn("noah@mit.edu");
  const table = await createTable(noah.session, { capacity: 1 });
  expect(await client.api.tables.place({ session: noah.session, gathering: table.gathering })).toEqual({
    hosting: true,
    place: { reservation: null, position: null },
  });

  const ana = await signIn("ana@mit.edu");
  const seat = await accept(ana.session, table.token);
  expect(await client.api.tables.place({ session: ana.session, gathering: table.gathering })).toEqual({
    hosting: false,
    place: { reservation: seat.reservation, position: null },
  });
});

test("the guest test account is a second demo user next to the test student", async () => {
  const student = await client.auth["test-login"]({});
  const guest = await client.auth["test-login"]({ account: "guest" });
  if ("error" in student || "error" in guest) throw new Error("test login refused");
  expect(student.email).toBe("test-student@mit.edu");
  expect(guest.email).toBe("test-guest@mit.edu");
  expect(guest.user).not.toBe(student.user);
});
