import { createHash } from "node:crypto";
import { beforeEach, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { InvalidSessionLifetime, SessioningConcept, UnknownSession } from "../src/concepts/Sessioning.ts";
import { testDatabase } from "./support/mongo.ts";

const at = (minutes: number) => new Date(Date.UTC(2026, 11, 1, 12, minutes));

let database: Db;
let sessions: SessioningConcept;

beforeEach(async () => {
  database = await testDatabase();
  sessions = new SessioningConcept(database);
});

test("principle: starts, checks, ends, and expires sessions", async () => {
  const v1 = await sessions.start({ subject: "ari", lifetime: 20 * 60_000, now: at(0) });
  expect(v1.expiresAt).toEqual(at(20));

  expect(await sessions._active({ session: v1.session, now: at(10) })).toEqual([
    { subject: "ari", expiresAt: at(20) },
  ]);
  expect(await sessions.current({ session: v1.session, now: at(10) })).toEqual({ subject: "ari" });

  expect(await sessions.end({ session: v1.session, now: at(11) })).toEqual({ ended: true });
  await expect(sessions.current({ session: v1.session, now: at(11) })).rejects.toBeInstanceOf(UnknownSession);

  const v2 = await sessions.start({ subject: "ari", lifetime: 8 * 60_000, now: at(12) });
  expect(await sessions._active({ session: v2.session, now: at(20) })).toEqual([]);
  await expect(sessions.current({ session: v2.session, now: at(20) })).rejects.toBeInstanceOf(UnknownSession);
  await expect(sessions.current({ session: "invented", now: at(12) })).rejects.toBeInstanceOf(UnknownSession);
});

test("start refuses non-positive or non-finite lifetimes", async () => {
  await expect(sessions.start({ subject: "ari", lifetime: 0, now: at(0) })).rejects.toBeInstanceOf(
    InvalidSessionLifetime,
  );
  await expect(sessions.start({ subject: "ari", lifetime: -5, now: at(0) })).rejects.toBeInstanceOf(
    InvalidSessionLifetime,
  );
  await expect(sessions.start({ subject: "ari", lifetime: Number.NaN, now: at(0) })).rejects.toBeInstanceOf(
    InvalidSessionLifetime,
  );
});

test("stores SHA-256 token hash instead of raw token and creates a TTL index on expiresAt", async () => {
  const { session } = await sessions.start({ subject: "ari", lifetime: 20 * 60_000, now: at(0) });
  const expectedHash = createHash("sha256").update(session).digest("hex");

  const collection = database.collection<{ _id: string; subject: string; expiresAt: Date }>("sessioning.sessions");
  expect(await collection.findOne({ _id: session })).toBeNull();
  const stored = await collection.findOne({ _id: expectedHash });
  expect(stored?.subject).toBe("ari");

  const indexes = await collection.indexes();
  expect(indexes).toContainEqual(
    expect.objectContaining({
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
    }),
  );
});
