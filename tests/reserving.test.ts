import { beforeEach, expect, test } from "bun:test";
import {
  AlreadyInPool,
  AlreadyReserved,
  CannotCancel,
  InvalidPool,
  NoSuchReservation,
  PoolClosed,
  PoolFull,
  ReservingConcept,
  SpotsAvailable,
} from "../src/concepts/Reserving.ts";
import { testDatabase } from "./support/mongo.ts";
import { expectOneWinner } from "./support/race.ts";

const table = "table";
let r: ReservingConcept;
beforeEach(async () => {
  r = new ReservingConcept(await testDatabase());
});

test("principle: a cancelled spot goes to the first person waiting, and a locked pool freezes", async () => {
  await r.openPool({ resource: table, capacity: 2 });
  const { reservation: ana } = await r.reserve({ resource: table, user: "ana" });
  await r.reserve({ resource: table, user: "ben" });

  // the pool is full, so cy and di wait in order
  await expect(r.reserve({ resource: table, user: "cy" })).rejects.toBeInstanceOf(PoolFull);
  await r.joinWaitlist({ resource: table, user: "cy" });
  await r.joinWaitlist({ resource: table, user: "di" });
  expect(await r._getAvailability({ resource: table })).toEqual([{ capacity: 2, reservedCount: 2, remaining: 0, waitlistCount: 2, locked: false }]);
  expect(await r._getWaitlistPosition({ resource: table, user: "di" })).toEqual([{ position: 2 }]);

  // ana cancels and cy, who waited longest, takes the spot in the same step
  expect(await r.cancel({ reservation: ana })).toEqual({ resource: table, user: "ana", promoted: "cy" });
  const [{ reservation: cy }] = await r._getReservation({ resource: table, user: "cy" });
  expect(await r._getReservedUsers({ resource: table })).toEqual([{ user: "ben" }, { user: "cy" }]);
  expect(await r._getWaitlistPosition({ resource: table, user: "di" })).toEqual([{ position: 1 }]);
  expect(await r._hasReservation({ resource: table, user: "ana" })).toEqual({ reserved: false });

  // once locked, nothing changes
  await r.lock({ resource: table });
  await r.lock({ resource: table });
  await expect(r.reserve({ resource: table, user: "ana" })).rejects.toBeInstanceOf(PoolClosed);
  await expect(r.joinWaitlist({ resource: table, user: "ana" })).rejects.toBeInstanceOf(PoolClosed);
  await expect(r.cancel({ reservation: cy })).rejects.toBeInstanceOf(CannotCancel);
  expect((await r._getAvailability({ resource: table }))[0]).toMatchObject({ reservedCount: 2, waitlistCount: 1, locked: true });
});

test("each refusal has its own case", async () => {
  await expect(r.openPool({ resource: table, capacity: 0 })).rejects.toBeInstanceOf(InvalidPool);
  await r.openPool({ resource: table, capacity: 1 });
  await expect(r.openPool({ resource: table, capacity: 4 })).rejects.toBeInstanceOf(InvalidPool);

  await expect(r.joinWaitlist({ resource: table, user: "ana" })).rejects.toBeInstanceOf(SpotsAvailable);
  await r.reserve({ resource: table, user: "ana" });
  await expect(r.reserve({ resource: table, user: "ana" })).rejects.toBeInstanceOf(AlreadyReserved);
  await expect(r.joinWaitlist({ resource: table, user: "ana" })).rejects.toBeInstanceOf(AlreadyInPool);
  await r.joinWaitlist({ resource: table, user: "ben" });
  await expect(r.joinWaitlist({ resource: table, user: "ben" })).rejects.toBeInstanceOf(AlreadyInPool);
  await expect(r.cancel({ reservation: "nothing" })).rejects.toBeInstanceOf(NoSuchReservation);

  // leaving the waitlist frees the place, and a resource without a pool answers with no rows
  await r.leaveWaitlist({ resource: table, user: "ben" });
  expect(await r._getWaitlistPosition({ resource: table, user: "ben" })).toEqual([]);
  expect(await r._getAvailability({ resource: "elsewhere" })).toEqual([]);
  await expect(r.reserve({ resource: "elsewhere", user: "ana" })).rejects.toThrow("no reservation pool");
});

test("a cancel with nobody waiting opens the spot and promotes no one", async () => {
  await r.openPool({ resource: table, capacity: 1 });
  const { reservation } = await r.reserve({ resource: table, user: "ana" });
  expect(await r.cancel({ reservation })).toEqual({ resource: table, user: "ana", promoted: undefined });
  expect((await r._getAvailability({ resource: table }))[0]).toMatchObject({ reservedCount: 0, remaining: 1, waitlistCount: 0 });
  await r.reserve({ resource: table, user: "ben" });
});

test("ten people racing for the last seat leave exactly one winner", async () => {
  await r.openPool({ resource: table, capacity: 3 });
  await r.reserve({ resource: table, user: "ana" });
  await r.reserve({ resource: table, user: "ben" });
  const racers = Array.from({ length: 10 }, (_, i) => r.reserve({ resource: table, user: `racer-${i}` }));
  await expectOneWinner(racers, PoolFull);
  expect((await r._getAvailability({ resource: table }))[0]).toMatchObject({ reservedCount: 3, remaining: 0 });
});

test("one person reserving twice at once gets one reservation", async () => {
  await r.openPool({ resource: table, capacity: 5 });
  await expectOneWinner([r.reserve({ resource: table, user: "ana" }), r.reserve({ resource: table, user: "ana" })], AlreadyReserved);
  expect(await r._getReservedUsers({ resource: table })).toEqual([{ user: "ana" }]);
});

test("a freed seat goes to the waitlist, never to people reserving at the same moment", async () => {
  await r.openPool({ resource: table, capacity: 1 });
  const { reservation } = await r.reserve({ resource: table, user: "ana" });
  await r.joinWaitlist({ resource: table, user: "ben" });
  await r.joinWaitlist({ resource: table, user: "cy" });

  // the cancel is the only attempt that succeeds; every direct reserve finds the pool still full
  const racers = Array.from({ length: 10 }, (_, i) => r.reserve({ resource: table, user: `racer-${i}` }));
  await expectOneWinner([r.cancel({ reservation }), ...racers], PoolFull);
  expect(await r._getReservedUsers({ resource: table })).toEqual([{ user: "ben" }]);
  expect(await r._getWaitlistPosition({ resource: table, user: "cy" })).toEqual([{ position: 1 }]);
});

test("cancelling one reservation twice at once promotes one person", async () => {
  await r.openPool({ resource: table, capacity: 1 });
  const { reservation } = await r.reserve({ resource: table, user: "ana" });
  await r.joinWaitlist({ resource: table, user: "ben" });
  await r.joinWaitlist({ resource: table, user: "cy" });
  await expectOneWinner([r.cancel({ reservation }), r.cancel({ reservation })], NoSuchReservation);
  expect(await r._getReservedUsers({ resource: table })).toEqual([{ user: "ben" }]);
  expect((await r._getAvailability({ resource: table }))[0]).toMatchObject({ reservedCount: 1, waitlistCount: 1 });
});

test("claim takes a spot while one is open and a waitlist place after that", async () => {
  await r.openPool({ resource: table, capacity: 1 });
  const { reservation } = await r.claim({ resource: table, user: "ana" });
  expect(await r._getReservation({ resource: table, user: "ana" })).toEqual([{ reservation: reservation! }]);
  expect(await r.claim({ resource: table, user: "ben" })).toEqual({ position: 1 });
  expect(await r.claim({ resource: table, user: "cy" })).toEqual({ position: 2 });

  await expect(r.claim({ resource: table, user: "ana" })).rejects.toBeInstanceOf(AlreadyInPool);
  await expect(r.claim({ resource: table, user: "ben" })).rejects.toBeInstanceOf(AlreadyInPool);
  await expect(r.claim({ resource: "elsewhere", user: "ana" })).rejects.toThrow("no reservation pool");
  await r.lock({ resource: table });
  await expect(r.claim({ resource: table, user: "di" })).rejects.toBeInstanceOf(PoolClosed);
});

test("ten people claiming three seats at once all end up seated or waiting in line", async () => {
  await r.openPool({ resource: table, capacity: 3 });
  const outcomes = await Promise.all(Array.from({ length: 10 }, (_, i) => r.claim({ resource: table, user: `guest-${i}` })));
  expect(outcomes.filter((o) => o.reservation)).toHaveLength(3);
  // the seven others hold places 1 to 7, with no place given twice
  expect(outcomes.flatMap((o) => o.position ?? []).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(await r._getAvailability({ resource: table })).toEqual([{ capacity: 3, reservedCount: 3, remaining: 0, waitlistCount: 7, locked: false }]);
});

test("claims racing a cancel leave nobody without a seat or a waitlist place", async () => {
  await r.openPool({ resource: table, capacity: 1 });
  const { reservation } = await r.reserve({ resource: table, user: "ana" });
  const guests = Array.from({ length: 6 }, (_, i) => `guest-${i}`);
  await Promise.all([r.cancel({ reservation }), ...guests.map((user) => r.claim({ resource: table, user }))]);

  // whichever way the race went, one guest has the seat and the other five are waiting
  expect(await r._getAvailability({ resource: table })).toEqual([{ capacity: 1, reservedCount: 1, remaining: 0, waitlistCount: 5, locked: false }]);
  for (const user of guests) {
    const seated = (await r._hasReservation({ resource: table, user })).reserved;
    const waiting = (await r._getWaitlistPosition({ resource: table, user })).length === 1;
    expect(seated !== waiting).toBe(true);
  }
});

test("one person claiming twice at once gets one spot", async () => {
  await r.openPool({ resource: table, capacity: 5 });
  await expectOneWinner([r.claim({ resource: table, user: "ana" }), r.claim({ resource: table, user: "ana" })], AlreadyInPool);
  expect(await r._getReservedUsers({ resource: table })).toEqual([{ user: "ana" }]);
});
