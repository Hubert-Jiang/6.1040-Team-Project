import { afterAll, beforeEach, expect, test } from "bun:test";
import { createHttpClient, type HttpClientError } from "@mit-sdg/sync-engine-http/client";
import type { Client } from "@mit-sdg/sync-engine/client";
import type { AppWireHttp } from "../generated/wire.ts";
import { startHost } from "../src/host.ts";
import { testDatabase } from "./support/mongo.ts";

let server: ReturnType<typeof startHost> | undefined;
let client: Client<AppWireHttp, HttpClientError>;
// the session of the demo test account, who hosts in these tests
let host: string;

// `soon(h)` is h hours from now, as the text a browser sends
const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
// a dinner whose RSVPs close in 4 hours and which runs from hour 6 to hour 8, with 4 guest spots
const dinner = () => ({ session: host, title: "Break dinner", area: "Kendall Square", cutoffTime: soon(4), startTime: soon(6), endTime: soon(8), capacity: 4 });

beforeEach(async () => {
  server?.stop(true);
  const petrock = { exchangeCode: async () => ({ externalId: "ben@mit.edu", email: "ben@mit.edu", name: "Ben Bitdiddle", affiliation: "student" }) };
  server = startHost({ hostname: "127.0.0.1", port: 0, database: await testDatabase(), petrock });
  client = createHttpClient<AppWireHttp>({ baseUrl: `http://127.0.0.1:${server.port}/` });
  const login = await client.auth["test-login"]({});
  if ("error" in login) throw new Error(login.error);
  host = login.session;
});

afterAll(() => {
  server?.stop(true);
});

/** Returns the session of a second user, signed in through the stand-in for Touchstone. */
async function ben() {
  const start = await client.auth.petrock.start({});
  if ("error" in start) throw new Error(start.error);
  const state = new URL(start.authorizationUrl).searchParams.get("state") ?? "";
  const callback = await client.auth.petrock.callback({ code: "any", state });
  if ("error" in callback) throw new Error(callback.error);
  return callback.session;
}

/** Returns the gathering created from `input`, failing the test if it was refused. */
async function created(input: ReturnType<typeof dinner> & { details?: string; confirmedVenue?: string }) {
  const result = await client.gatherings.create(input);
  if ("error" in result) throw new Error(result.error);
  return result.gathering;
}

test("a signed-in host creates a table, sees it in their list, and views it with its open spots", async () => {
  const input = { ...dinner(), details: "Tapas, about $25", confirmedVenue: "Oleana" };
  const gathering = await created(input);

  expect(await client.gatherings.mine({ session: host })).toEqual({
    hosted: { tables: [{ gathering, title: "Break dinner", status: "OPEN", startTime: input.startTime }] },
  });
  expect(await client.gatherings.view({ session: host, gathering })).toEqual({
    title: "Break dinner",
    status: "OPEN",
    area: "Kendall Square",
    startTime: input.startTime,
    endTime: input.endTime,
    cutoffTime: input.cutoffTime,
    details: "Tapas, about $25",
    confirmedVenue: "Oleana",
    capacity: 4,
    reservedCount: 0,
    remaining: 4,
    waitlistCount: 0,
    locked: false,
  });
});

test("a table with no details and no venue still views", async () => {
  const gathering = await created(dinner());
  const view = await client.gatherings.view({ session: host, gathering });
  expect(view).toMatchObject({ title: "Break dinner", status: "OPEN", capacity: 4, remaining: 4 });
  expect(view).not.toHaveProperty("details");
  expect(view).not.toHaveProperty("confirmedVenue");
});

test("every endpoint needs an active session", async () => {
  const gathering = await created(dinner());
  expect(await client.gatherings.create({ ...dinner(), session: "made-up" })).toEqual({ error: "UNAUTHORIZED" });
  expect(await client.gatherings.mine({ session: "made-up" })).toEqual({ error: "UNAUTHORIZED" });
  expect(await client.gatherings.view({ session: "made-up", gathering })).toEqual({ error: "UNAUTHORIZED" });

  // a signed-out session stops working
  await client.auth.logout({ session: host });
  expect(await client.gatherings.mine({ session: host })).toEqual({ error: "UNAUTHORIZED" });
});

test("a refused create leaves nothing behind", async () => {
  const refused = [
    { ...dinner(), capacity: 0 },
    { ...dinner(), capacity: 2.5 },
    { ...dinner(), title: "   " },
    { ...dinner(), cutoffTime: soon(7) },
    { ...dinner(), cutoffTime: soon(-1) },
    { ...dinner(), startTime: "not a date" },
    { ...dinner(), title: 7 as unknown as string },
  ];
  for (const input of refused) expect(await client.gatherings.create(input)).toEqual({ error: "INVALID_REQUEST" });
  expect(await client.gatherings.mine({ session: host })).toEqual({ hosted: { tables: [] } });
});

test("a host keeps at most 3 active tables", async () => {
  for (let i = 0; i < 3; i++) await created(dinner());
  expect(await client.gatherings.create(dinner())).toEqual({ error: "CONFLICT" });
  const mine = await client.gatherings.mine({ session: host });
  if ("error" in mine) throw new Error(mine.error);
  expect(mine.hosted.tables).toHaveLength(3);
});

test("another user cannot view a host's table or see it in their own list", async () => {
  const gathering = await created(dinner());
  const other = await ben();
  expect(await client.gatherings.view({ session: other, gathering })).toEqual({ error: "NOT_FOUND" });
  expect(await client.gatherings.view({ session: host, gathering: "no-such-table" })).toEqual({ error: "NOT_FOUND" });
  expect(await client.gatherings.mine({ session: other })).toEqual({ hosted: { tables: [] } });
});

/** Returns the status and lock of the host's table. */
async function state(gathering: string) {
  const view = await client.gatherings.view({ session: host, gathering });
  if ("error" in view) throw new Error(view.error);
  return { status: view.status, locked: view.locked };
}

test("a host confirms and books a table with a venue, which frees one of their 3 places", async () => {
  const gathering = await created({ ...dinner(), confirmedVenue: "Oleana" });
  await created(dinner());
  await created(dinner());

  // booking comes after confirming
  expect(await client.gatherings.book({ session: host, gathering })).toEqual({ error: "CONFLICT" });
  expect(await client.gatherings.confirm({ session: host, gathering })).toEqual({});
  expect(await client.gatherings.confirm({ session: host, gathering })).toEqual({ error: "CONFLICT" });
  expect(await client.gatherings.create(dinner())).toEqual({ error: "CONFLICT" });
  expect(await client.gatherings.book({ session: host, gathering })).toEqual({});
  expect(await state(gathering)).toEqual({ status: "BOOKED", locked: false });
  await created(dinner());
});

test("a table without a venue cannot be booked", async () => {
  const gathering = await created(dinner());
  await client.gatherings.confirm({ session: host, gathering });
  expect(await client.gatherings.book({ session: host, gathering })).toEqual({ error: "CONFLICT" });
  expect(await state(gathering)).toEqual({ status: "CONFIRMED", locked: false });
});

test("cancelling a table locks its pool, and it cannot be cancelled twice", async () => {
  const gathering = await created(dinner());
  expect(await client.gatherings.cancel({ session: host, gathering })).toEqual({});
  expect(await state(gathering)).toEqual({ status: "CANCELLED", locked: true });
  expect(await client.gatherings.cancel({ session: host, gathering })).toEqual({ error: "CONFLICT" });
  expect(await client.gatherings.confirm({ session: host, gathering })).toEqual({ error: "CONFLICT" });
});

test("another user cannot confirm, book, or cancel a host's table", async () => {
  const gathering = await created({ ...dinner(), confirmedVenue: "Oleana" });
  const other = await ben();
  expect(await client.gatherings.confirm({ session: other, gathering })).toEqual({ error: "NOT_FOUND" });
  expect(await client.gatherings.book({ session: other, gathering })).toEqual({ error: "NOT_FOUND" });
  expect(await client.gatherings.cancel({ session: other, gathering })).toEqual({ error: "NOT_FOUND" });
  expect(await client.gatherings.cancel({ session: host, gathering: "no-such-table" })).toEqual({ error: "NOT_FOUND" });
  expect(await state(gathering)).toEqual({ status: "OPEN", locked: false });
});
