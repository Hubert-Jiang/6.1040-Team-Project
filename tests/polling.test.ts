import { beforeEach, expect, test } from "bun:test";
import {
  DuplicateOption,
  InvalidOption,
  NoSuchOption,
  OptionLimitReached,
  PollingConcept,
} from "../src/concepts/Polling.ts";
import { testDatabase } from "./support/mongo.ts";

const at = (minutes: number) => new Date(Date.UTC(2026, 11, 1, 12, minutes));

let p: PollingConcept;
beforeEach(async () => {
  p = new PollingConcept(await testDatabase());
});

test("principle: propose options, reject duplicates, switch/clear votes, and cascade-delete votes on option removal", async () => {
  const { option: dumpling } = await p.addOption({
    scope: "lunch_1",
    label: "Dumpling House",
    proposedBy: "ari",
    now: at(0),
  });
  const { option: taco } = await p.addOption({
    scope: "lunch_1",
    label: "Taco Spot",
    proposedBy: "bea",
    now: at(1),
  });

  await expect(
    p.addOption({ scope: "lunch_1", label: "dumpling house", proposedBy: "cat", now: at(2) }),
  ).rejects.toBeInstanceOf(DuplicateOption);

  expect(await p.castVote({ scope: "lunch_1", option: dumpling, voter: "ari" })).toEqual({});
  expect(await p.castVote({ scope: "lunch_1", option: taco, voter: "bea" })).toEqual({});
  expect(await p.castVote({ scope: "lunch_1", option: dumpling, voter: "bea" })).toEqual({});

  expect(await p._getVoteCount({ option: dumpling })).toEqual({ voteCount: 2 });
  expect(await p._getVoteCount({ option: taco })).toEqual({ voteCount: 0 });

  expect(await p.clearVote({ scope: "lunch_1", voter: "ari" })).toEqual({});
  expect(await p._getVoteCount({ option: dumpling })).toEqual({ voteCount: 1 });
  expect(await p._getVote({ scope: "lunch_1", voter: "ari" })).toEqual([]);
  expect(await p._getVote({ scope: "lunch_1", voter: "bea" })).toEqual([{ option: dumpling }]);

  expect(await p.removeOption({ scope: "lunch_1", option: dumpling })).toEqual({});
  expect(await p._getOption({ option: dumpling })).toEqual([]);
  expect(await p._getVoteCount({ option: dumpling })).toEqual({ voteCount: 0 });
  expect(await p._getVote({ scope: "lunch_1", voter: "bea" })).toEqual([]);
  expect(await p._listOptions({ scope: "lunch_1" })).toEqual([
    { option: taco, label: "Taco Spot", proposedBy: "bea", createdAt: at(1) },
  ]);
});

test("addOption trims labels, enforces 1..100 character bounds, and deduplicates case-insensitively per scope", async () => {
  await expect(
    p.addOption({ scope: "s1", label: "", proposedBy: "ari", now: at(0) }),
  ).rejects.toBeInstanceOf(InvalidOption);
  await expect(
    p.addOption({ scope: "s1", label: "   \t\n ", proposedBy: "ari", now: at(0) }),
  ).rejects.toBeInstanceOf(InvalidOption);
  await expect(
    p.addOption({ scope: "s1", label: "x".repeat(101), proposedBy: "ari", now: at(0) }),
  ).rejects.toBeInstanceOf(InvalidOption);

  const maxLabel = "a".repeat(100);
  const { option: optMax } = await p.addOption({
    scope: "s1",
    label: `  ${maxLabel}  `,
    proposedBy: "ari",
    now: at(1),
  });
  const { option: optMin } = await p.addOption({
    scope: "s1",
    label: " Z ",
    proposedBy: "bea",
    now: at(2),
  });

  expect(await p._getOption({ option: optMax })).toEqual([
    { scope: "s1", label: maxLabel, proposedBy: "ari" },
  ]);
  expect(await p._getOption({ option: optMin })).toEqual([
    { scope: "s1", label: "Z", proposedBy: "bea" },
  ]);

  await expect(
    p.addOption({ scope: "s1", label: "  z  ", proposedBy: "cat", now: at(3) }),
  ).rejects.toBeInstanceOf(DuplicateOption);

  // Same normalized label is allowed in a different scope.
  const { option: otherScopeOpt } = await p.addOption({
    scope: "s2",
    label: "z",
    proposedBy: "cat",
    now: at(3),
  });
  expect(await p._getOption({ option: otherScopeOpt })).toEqual([
    { scope: "s2", label: "z", proposedBy: "cat" },
  ]);
});

test("addOption enforces a 20-option cap per scope with DuplicateOption taking precedence over limit", async () => {
  for (let i = 0; i < 20; i++) {
    await p.addOption({ scope: "full", label: `Place ${i}`, proposedBy: "ari", now: at(i) });
  }
  expect(await p._listOptions({ scope: "full" })).toHaveLength(20);

  // Duplicate check runs before option-limit check per contract.
  await expect(
    p.addOption({ scope: "full", label: "  place 0  ", proposedBy: "bea", now: at(21) }),
  ).rejects.toBeInstanceOf(DuplicateOption);

  await expect(
    p.addOption({ scope: "full", label: "Place 20", proposedBy: "bea", now: at(22) }),
  ).rejects.toBeInstanceOf(OptionLimitReached);
  expect(await p._listOptions({ scope: "full" })).toHaveLength(20);

  // Other scopes are unaffected by "full" hitting 20 options.
  const { option: other } = await p.addOption({
    scope: "other",
    label: "Place 20",
    proposedBy: "bea",
    now: at(23),
  });
  expect(await p._getOption({ option: other })).toEqual([
    { scope: "other", label: "Place 20", proposedBy: "bea" },
  ]);

  // Removing an option frees room for a new one in the same scope.
  const listed = await p._listOptions({ scope: "full" });
  await p.removeOption({ scope: "full", option: listed[0]!.option });
  await p.addOption({ scope: "full", label: "Place 20", proposedBy: "bea", now: at(24) });
  expect(await p._listOptions({ scope: "full" })).toHaveLength(20);
});

test("clearVote is idempotent and votes are isolated across scopes", async () => {
  const { option: o1 } = await p.addOption({ scope: "s1", label: "Cafe A", proposedBy: "ari", now: at(0) });
  const { option: o2 } = await p.addOption({ scope: "s2", label: "Cafe B", proposedBy: "ari", now: at(0) });

  // Clearing before any vote exists is a no-op.
  expect(await p.clearVote({ scope: "s1", voter: "ari" })).toEqual({});

  await p.castVote({ scope: "s1", option: o1, voter: "ari" });
  await p.castVote({ scope: "s2", option: o2, voter: "ari" });

  await p.clearVote({ scope: "s1", voter: "ari" });
  await p.clearVote({ scope: "s1", voter: "ari" });

  expect(await p._getVote({ scope: "s1", voter: "ari" })).toEqual([]);
  expect(await p._getVoteCount({ option: o1 })).toEqual({ voteCount: 0 });
  expect(await p._getVote({ scope: "s2", voter: "ari" })).toEqual([{ option: o2 }]);
  expect(await p._getVoteCount({ option: o2 })).toEqual({ voteCount: 1 });
});

test("castVote and removeOption refuse cross-scope and nonexistent options with NoSuchOption", async () => {
  const { option: optA } = await p.addOption({ scope: "a", label: "Alpha", proposedBy: "ari", now: at(0) });
  await p.castVote({ scope: "a", option: optA, voter: "ari" });

  await expect(p.castVote({ scope: "b", option: optA, voter: "bea" })).rejects.toBeInstanceOf(NoSuchOption);
  await expect(p.castVote({ scope: "a", option: "missing", voter: "bea" })).rejects.toBeInstanceOf(NoSuchOption);
  expect(await p._getVote({ scope: "b", voter: "bea" })).toEqual([]);
  expect(await p._getVote({ scope: "a", voter: "bea" })).toEqual([]);

  await expect(p.removeOption({ scope: "b", option: optA })).rejects.toBeInstanceOf(NoSuchOption);
  await expect(p.removeOption({ scope: "a", option: "missing" })).rejects.toBeInstanceOf(NoSuchOption);

  // Original option and vote in scope "a" remain untouched.
  expect(await p._getOption({ option: optA })).toEqual([{ scope: "a", label: "Alpha", proposedBy: "ari" }]);
  expect(await p._getVoteCount({ option: optA })).toEqual({ voteCount: 1 });

  // Removing twice fails with NoSuchOption on the second call.
  await p.removeOption({ scope: "a", option: optA });
  await expect(p.removeOption({ scope: "a", option: optA })).rejects.toBeInstanceOf(NoSuchOption);
});

test("query shapes and _listOptions ordering (createdAt ascending, then option id)", async () => {
  expect(await p._listOptions({ scope: "empty" })).toEqual([]);
  expect(await p._getOption({ option: "missing" })).toEqual([]);
  expect(await p._getVoteCount({ option: "missing" })).toEqual({ voteCount: 0 });
  expect(await p._getVote({ scope: "empty", voter: "ari" })).toEqual([]);

  const { option: later } = await p.addOption({ scope: "ord", label: "Later", proposedBy: "ari", now: at(10) });
  const { option: tie1 } = await p.addOption({ scope: "ord", label: "Tie 1", proposedBy: "bea", now: at(5) });
  const { option: tie2 } = await p.addOption({ scope: "ord", label: "Tie 2", proposedBy: "cat", now: at(5) });
  const { option: earliest } = await p.addOption({ scope: "ord", label: "Earliest", proposedBy: "dan", now: at(1) });

  const listed = await p._listOptions({ scope: "ord" });
  const expectedTies = [
    { option: tie1, label: "Tie 1", proposedBy: "bea", createdAt: at(5) },
    { option: tie2, label: "Tie 2", proposedBy: "cat", createdAt: at(5) },
  ].sort((a, b) => a.option.localeCompare(b.option));

  expect(listed).toEqual([
    { option: earliest, label: "Earliest", proposedBy: "dan", createdAt: at(1) },
    ...expectedTies,
    { option: later, label: "Later", proposedBy: "ari", createdAt: at(10) },
  ]);

  // Verify exact row keys (no leaked internal fields like normalizedLabel or scope on _listOptions).
  expect(Object.keys(listed[0]!).sort()).toEqual(["createdAt", "label", "option", "proposedBy"]);
  const single = await p._getOption({ option: earliest });
  expect(Object.keys(single[0]!).sort()).toEqual(["label", "proposedBy", "scope"]);
  expect(Object.keys(await p._getVoteCount({ option: earliest }))).toEqual(["voteCount"]);
  await p.castVote({ scope: "ord", option: earliest, voter: "ari" });
  expect(Object.keys((await p._getVote({ scope: "ord", voter: "ari" }))[0]!)).toEqual(["option"]);
});

test("concurrent duplicate addOption resolves once and rejects others with DuplicateOption", async () => {
  const outcomes = await Promise.allSettled([
    p.addOption({ scope: "race", label: "Noodle Bar", proposedBy: "ari", now: at(0) }),
    p.addOption({ scope: "race", label: "noodle bar", proposedBy: "bea", now: at(0) }),
    p.addOption({ scope: "race", label: "  NOODLE BAR ", proposedBy: "cat", now: at(0) }),
  ]);

  const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
  const rejected = outcomes.filter((o) => o.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(2);
  for (const r of rejected) {
    if (r.status === "rejected") expect(r.reason).toBeInstanceOf(DuplicateOption);
  }
  expect(await p._listOptions({ scope: "race" })).toHaveLength(1);
});

test("concurrent castVote calls for one (scope, voter) leave exactly one vote", async () => {
  const { option: o1 } = await p.addOption({ scope: "race", label: "One", proposedBy: "ari", now: at(0) });
  const { option: o2 } = await p.addOption({ scope: "race", label: "Two", proposedBy: "bea", now: at(1) });

  await Promise.all([
    p.castVote({ scope: "race", option: o1, voter: "ari" }),
    p.castVote({ scope: "race", option: o2, voter: "ari" }),
    p.castVote({ scope: "race", option: o1, voter: "ari" }),
  ]);

  const vote = await p._getVote({ scope: "race", voter: "ari" });
  expect(vote).toHaveLength(1);
  expect([o1, o2]).toContain(vote[0]!.option);

  const { voteCount: c1 } = await p._getVoteCount({ option: o1 });
  const { voteCount: c2 } = await p._getVoteCount({ option: o2 });
  expect(c1 + c2).toBe(1);
});

test("collection name parameter isolates independent PollingConcept instances", async () => {
  const db = await testDatabase();
  const pollA = new PollingConcept(db, "PollA");
  const pollB = new PollingConcept(db, "PollB");

  const { option: optA } = await pollA.addOption({ scope: "s", label: "Same", proposedBy: "ari", now: at(0) });
  const { option: optB } = await pollB.addOption({ scope: "s", label: "Same", proposedBy: "bea", now: at(0) });

  await pollA.castVote({ scope: "s", option: optA, voter: "ari" });
  expect(await pollA._listOptions({ scope: "s" })).toHaveLength(1);
  expect(await pollB._listOptions({ scope: "s" })).toHaveLength(1);
  expect(await pollB._getOption({ option: optA })).toEqual([]);
  expect(await pollB._getVote({ scope: "s", voter: "ari" })).toEqual([]);
  expect(await pollA._getOption({ option: optB })).toEqual([]);
});
