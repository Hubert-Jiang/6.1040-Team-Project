import { beforeEach, expect, test } from "bun:test";
import { AlreadyAccepted, InvalidPendingKey, InvitingConcept, NotAccepted } from "../src/concepts/Inviting.ts";
import { testDatabase } from "./support/mongo.ts";
import { expectOneWinner } from "./support/race.ts";

let inviting: InvitingConcept;
beforeEach(async () => {
  inviting = new InvitingConcept(await testDatabase());
});

/** Whether the guest has accepted the event. */
async function accepted(event: string, guest: string) {
  return (await inviting._isAccepted({ event, guest })).accepted;
}

test("principle: a guest accepts, withdraws, and can accept again", async () => {
  expect(await accepted("dinner", "bea")).toBe(false);
  const first = await inviting.accept({ event: "dinner", guest: "bea" });
  expect(typeof first.acceptance).toBe("string");
  expect(await accepted("dinner", "bea")).toBe(true);

  await inviting.withdraw({ event: "dinner", guest: "bea" });
  expect(await accepted("dinner", "bea")).toBe(false);

  // withdrawing leaves nothing behind that blocks a change of mind
  const second = await inviting.accept({ event: "dinner", guest: "bea" });
  expect(second.acceptance).not.toBe(first.acceptance);
  expect(await accepted("dinner", "bea")).toBe(true);
});

test("principle: a signed-out guest's acceptance waits under a key until they sign in", async () => {
  await inviting.deferAccept({ event: "dinner", pendingKey: "k1" });
  expect(await inviting._getPendingForKey({ pendingKey: "k1" })).toEqual([{ event: "dinner" }]);

  // after sign-in the composition clears the pending entry and accepts as the real user
  await inviting.clearPending({ event: "dinner", pendingKey: "k1" });
  await inviting.accept({ event: "dinner", guest: "cal" });
  expect(await inviting._getPendingForKey({ pendingKey: "k1" })).toEqual([]);
  expect(await accepted("dinner", "cal")).toBe(true);
});

test("accepting twice is refused, and so is withdrawing without accepting", async () => {
  await inviting.accept({ event: "dinner", guest: "bea" });
  await expect(inviting.accept({ event: "dinner", guest: "bea" })).rejects.toBeInstanceOf(AlreadyAccepted);
  await expect(inviting.withdraw({ event: "dinner", guest: "cal" })).rejects.toBeInstanceOf(NotAccepted);
  await expect(inviting.withdraw({ event: "lunch", guest: "bea" })).rejects.toBeInstanceOf(NotAccepted);

  await inviting.withdraw({ event: "dinner", guest: "bea" });
  await expect(inviting.withdraw({ event: "dinner", guest: "bea" })).rejects.toBeInstanceOf(NotAccepted);
});

test("acceptances are kept per event and per guest", async () => {
  await inviting.accept({ event: "dinner", guest: "bea" });
  await inviting.accept({ event: "lunch", guest: "bea" });
  await inviting.accept({ event: "dinner", guest: "cal" });
  await inviting.withdraw({ event: "dinner", guest: "bea" });

  expect(await accepted("dinner", "bea")).toBe(false);
  expect(await accepted("lunch", "bea")).toBe(true);
  expect(await accepted("dinner", "cal")).toBe(true);
});

test("an event's guests are listed in the order they accepted", async () => {
  for (const guest of ["bea", "cal", "dee", "eli"]) await inviting.accept({ event: "dinner", guest });
  await inviting.accept({ event: "lunch", guest: "fay" });
  await inviting.withdraw({ event: "dinner", guest: "cal" });

  expect(await inviting._getAcceptedGuests({ event: "dinner" })).toEqual([{ guest: "bea" }, { guest: "dee" }, { guest: "eli" }]);
  expect(await inviting._getAcceptedGuests({ event: "nothing" })).toEqual([]);
});

test("an empty pending key is refused, and deferring twice keeps one entry", async () => {
  await expect(inviting.deferAccept({ event: "dinner", pendingKey: "" })).rejects.toBeInstanceOf(InvalidPendingKey);
  await expect(inviting.deferAccept({ event: "dinner", pendingKey: "   " })).rejects.toBeInstanceOf(InvalidPendingKey);

  await inviting.deferAccept({ event: "dinner", pendingKey: "k1" });
  await inviting.deferAccept({ event: "dinner", pendingKey: "k1" });
  expect(await inviting._getPendingForKey({ pendingKey: "k1" })).toEqual([{ event: "dinner" }]);
  expect(await inviting._getPendingForKey({ pendingKey: "" })).toEqual([]);
});

test("one key can wait on several events, and clearing one leaves the rest", async () => {
  await inviting.deferAccept({ event: "dinner", pendingKey: "k1" });
  await inviting.deferAccept({ event: "lunch", pendingKey: "k1" });
  await inviting.deferAccept({ event: "dinner", pendingKey: "k2" });

  expect(await inviting._getPendingForKey({ pendingKey: "k1" })).toEqual([{ event: "dinner" }, { event: "lunch" }]);
  await inviting.clearPending({ event: "dinner", pendingKey: "k1" });
  expect(await inviting._getPendingForKey({ pendingKey: "k1" })).toEqual([{ event: "lunch" }]);
  expect(await inviting._getPendingForKey({ pendingKey: "k2" })).toEqual([{ event: "dinner" }]);

  // clearing something that is not there is harmless
  await inviting.clearPending({ event: "nothing", pendingKey: "k9" });
});

test("five accepts by one guest at once leave exactly one acceptance", async () => {
  const attempts = Array.from({ length: 5 }, () => inviting.accept({ event: "dinner", guest: "bea" }));
  await expectOneWinner(attempts, AlreadyAccepted);
  expect(await inviting._getAcceptedGuests({ event: "dinner" })).toEqual([{ guest: "bea" }]);
});

test("five defers of one key at once leave exactly one pending entry", async () => {
  await Promise.all(Array.from({ length: 5 }, () => inviting.deferAccept({ event: "dinner", pendingKey: "k1" })));
  expect(await inviting._getPendingForKey({ pendingKey: "k1" })).toEqual([{ event: "dinner" }]);
});
