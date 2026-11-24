import { describe, expect, test } from "bun:test";
import {
  BUDGET_TIERS,
  DIETARY_TAGS,
  InvalidDistance,
  InvalidProfile,
  ProfilingConcept,
} from "../src/concepts/Profiling.ts";
import { testDatabase } from "./support/mongo.ts";

describe("ProfilingConcept", () => {
  test("principle: saves, reads, updates, clears optional fields, and clears profile idempotently", async () => {
    const profiling = new ProfilingConcept(await testDatabase());

    expect(await profiling._getProfile({ user: "bea" })).toEqual([]);
    expect(await profiling.clearProfile({ user: "bea" })).toEqual({});

    const created = await profiling.setProfile({
      user: "bea",
      preferredName: "  Bea K.  ",
      dietaryRestrictions: ["VEGETARIAN", "VEGETARIAN", "NUT_FREE"],
      budgetPreferences: ["BUDGET", "MODERATE", "BUDGET"],
      walkPreferenceMinutes: 15,
      cuisinePreferences: ["  Thai ", "Ramen", "Thai", "   "],
      notes: "  Prefer quiet tables near a window.  ",
    });
    expect(created).toEqual({});

    const firstRead = await profiling._getProfile({ user: "bea" });
    expect(firstRead).toEqual([
      {
        preferredName: "Bea K.",
        dietaryRestrictions: ["VEGETARIAN", "NUT_FREE"],
        budgetPreferences: ["BUDGET", "MODERATE"],
        walkPreferenceMinutes: 15,
        cuisinePreferences: ["Thai", "Ramen"],
        notes: "Prefer quiet tables near a window.",
      },
    ]);
    expect(Object.keys(firstRead[0]).sort()).toEqual([
      "budgetPreferences",
      "cuisinePreferences",
      "dietaryRestrictions",
      "notes",
      "preferredName",
      "walkPreferenceMinutes",
    ]);

    // Update and clear optional fields back to undefined
    const updated = await profiling.setProfile({
      user: "bea",
      preferredName: "   ",
      dietaryRestrictions: ["HALAL"],
      budgetPreferences: ["FREE", "UPSCALE"],
      cuisinePreferences: [],
      notes: "",
    });
    expect(updated).toEqual({});

    const secondRead = await profiling._getProfile({ user: "bea" });
    expect(secondRead).toHaveLength(1);
    expect(secondRead[0].preferredName).toBeUndefined();
    expect(secondRead[0].walkPreferenceMinutes).toBeUndefined();
    expect(secondRead[0].notes).toBeUndefined();
    expect(secondRead[0].dietaryRestrictions).toEqual(["HALAL"]);
    expect(secondRead[0].budgetPreferences).toEqual(["FREE", "UPSCALE"]);
    expect(secondRead[0].cuisinePreferences).toEqual([]);

    expect(await profiling.clearProfile({ user: "bea" })).toEqual({});
    expect(await profiling._getProfile({ user: "bea" })).toEqual([]);
    expect(await profiling.clearProfile({ user: "bea" })).toEqual({});
    expect(await profiling._getProfile({ user: "bea" })).toEqual([]);
  });

  test("saves minimal profiles (only preferredName, or all empty/absent)", async () => {
    const profiling = new ProfilingConcept(await testDatabase());

    await profiling.setProfile({
      user: "alice",
      preferredName: "Alice",
      dietaryRestrictions: [],
      budgetPreferences: [],
      cuisinePreferences: [],
    });

    const aliceRows = await profiling._getProfile({ user: "alice" });
    expect(aliceRows).toHaveLength(1);
    expect(aliceRows[0].preferredName).toBe("Alice");
    expect(aliceRows[0].dietaryRestrictions).toEqual([]);
    expect(aliceRows[0].budgetPreferences).toEqual([]);
    expect(aliceRows[0].walkPreferenceMinutes).toBeUndefined();
    expect(aliceRows[0].cuisinePreferences).toEqual([]);
    expect(aliceRows[0].notes).toBeUndefined();

    await profiling.setProfile({
      user: "bob",
      dietaryRestrictions: [],
      budgetPreferences: [],
      cuisinePreferences: [],
    });

    const bobRows = await profiling._getProfile({ user: "bob" });
    expect(bobRows).toHaveLength(1);
    expect(bobRows[0].preferredName).toBeUndefined();
    expect(bobRows[0].dietaryRestrictions).toEqual([]);
    expect(bobRows[0].budgetPreferences).toEqual([]);
    expect(bobRows[0].walkPreferenceMinutes).toBeUndefined();
    expect(bobRows[0].cuisinePreferences).toEqual([]);
    expect(bobRows[0].notes).toBeUndefined();
  });

  test("accepts all declared dietary tags, budget tiers, and exact boundary lengths", async () => {
    const profiling = new ProfilingConcept(await testDatabase());
    const cuisines20 = Array.from({ length: 20 }, (_, i) => `Cuisine ${i + 1}`);

    expect(DIETARY_TAGS).toContain("SHELLFISH_FREE");

    await profiling.setProfile({
      user: "maxed",
      preferredName: `  ${"n".repeat(80)}  `,
      dietaryRestrictions: [...DIETARY_TAGS],
      budgetPreferences: [...BUDGET_TIERS],
      walkPreferenceMinutes: 0.5,
      cuisinePreferences: [...cuisines20, "Cuisine 1", "   ", `  ${"c".repeat(50)}  `].slice(0, 20).concat(["Cuisine 1", "   "]),
      notes: `  ${"x".repeat(500)}  `,
    });

    const [row] = await profiling._getProfile({ user: "maxed" });
    expect(row.preferredName).toBe("n".repeat(80));
    expect(row.dietaryRestrictions).toEqual([...DIETARY_TAGS]);
    expect(row.dietaryRestrictions).toContain("SHELLFISH_FREE");
    expect(row.budgetPreferences).toEqual([...BUDGET_TIERS]);
    expect(row.walkPreferenceMinutes).toBe(0.5);
    expect(row.cuisinePreferences).toHaveLength(20);
    expect(row.notes).toBe("x".repeat(500));

    // Explicit check that a 50-char trimmed cuisine and SHELLFISH_FREE alone succeed
    await profiling.setProfile({
      user: "maxed",
      dietaryRestrictions: ["SHELLFISH_FREE", "SHELLFISH_FREE"],
      budgetPreferences: [],
      cuisinePreferences: [`  ${"c".repeat(50)}  `],
    });
    const [updated] = await profiling._getProfile({ user: "maxed" });
    expect(updated.dietaryRestrictions).toEqual(["SHELLFISH_FREE"]);
    expect(updated.cuisinePreferences).toEqual(["c".repeat(50)]);
  });

  test("refuses InvalidDistance without mutating stored state", async () => {
    const profiling = new ProfilingConcept(await testDatabase());

    const badDistances = [0, -0, -5, 1440.1, 1441, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const walkPreferenceMinutes of badDistances) {
      await expect(
        profiling.setProfile({
          user: "u1",
          preferredName: "Initial",
          dietaryRestrictions: [],
          budgetPreferences: [],
          walkPreferenceMinutes,
          cuisinePreferences: [],
        }),
      ).rejects.toThrow(new InvalidDistance("Preferred travel time must be a positive number up to 1440 minutes."));
    }
    expect(await profiling._getProfile({ user: "u1" })).toEqual([]);

    // Boundary valid values: 0.5 and 1440
    await profiling.setProfile({
      user: "u1-boundary",
      dietaryRestrictions: [],
      budgetPreferences: [],
      walkPreferenceMinutes: 1440,
      cuisinePreferences: [],
    });
    expect((await profiling._getProfile({ user: "u1-boundary" }))[0]?.walkPreferenceMinutes).toBe(1440);

    // Existing profile stays unchanged on refusal, and InvalidDistance wins when both distance and profile are invalid
    await profiling.setProfile({
      user: "u1",
      preferredName: "Saved",
      dietaryRestrictions: ["VEGAN"],
      budgetPreferences: ["MODERATE"],
      walkPreferenceMinutes: 12,
      cuisinePreferences: ["Ethiopian"],
      notes: "Keep me",
    });

    await expect(
      profiling.setProfile({
        user: "u1",
        preferredName: "a".repeat(81),
        dietaryRestrictions: ["INVALID" as (typeof DIETARY_TAGS)[number]],
        budgetPreferences: [],
        walkPreferenceMinutes: 0,
        cuisinePreferences: [],
      }),
    ).rejects.toThrow(InvalidDistance);

    expect(await profiling._getProfile({ user: "u1" })).toEqual([
      {
        preferredName: "Saved",
        dietaryRestrictions: ["VEGAN"],
        budgetPreferences: ["MODERATE"],
        walkPreferenceMinutes: 12,
        cuisinePreferences: ["Ethiopian"],
        notes: "Keep me",
      },
    ]);
  });

  test("refuses InvalidProfile for bad tags, tiers, and oversized fields without mutating stored state", async () => {
    const profiling = new ProfilingConcept(await testDatabase());

    const baseline = {
      preferredName: "Baseline",
      dietaryRestrictions: ["KOSHER"] as (typeof DIETARY_TAGS)[number][],
      budgetPreferences: ["BUDGET"] as (typeof BUDGET_TIERS)[number][],
      walkPreferenceMinutes: 10,
      cuisinePreferences: ["Korean"],
      notes: "Baseline note",
    };
    await profiling.setProfile({ user: "u2", ...baseline });

    const invalidInputs = [
      { ...baseline, dietaryRestrictions: ["PESCATARIAN" as (typeof DIETARY_TAGS)[number]] },
      { ...baseline, budgetPreferences: ["LUXURY" as (typeof BUDGET_TIERS)[number]] },
      { ...baseline, preferredName: "a".repeat(81) },
      { ...baseline, notes: "b".repeat(501) },
      { ...baseline, cuisinePreferences: ["c".repeat(51)] },
      { ...baseline, cuisinePreferences: Array.from({ length: 21 }, (_, i) => `Cuisine ${i + 1}`) },
    ];

    for (const input of invalidInputs) {
      await expect(profiling.setProfile({ user: "u2", ...input })).rejects.toThrow(InvalidProfile);
    }

    expect(await profiling._getProfile({ user: "u2" })).toEqual([baseline]);
  });

  test("isolates collections by concept name", async () => {
    const db = await testDatabase();
    const first = new ProfilingConcept(db, "Profiling");
    const second = new ProfilingConcept(db, "OtherProfiling");

    await first.setProfile({
      user: "shared-id",
      preferredName: "First",
      dietaryRestrictions: [],
      budgetPreferences: [],
      cuisinePreferences: [],
    });

    expect(await first._getProfile({ user: "shared-id" })).toHaveLength(1);
    expect(await second._getProfile({ user: "shared-id" })).toEqual([]);
  });

  test("handles concurrent setProfile updates for the same user consistently", async () => {
    const profiling = new ProfilingConcept(await testDatabase());

    const payloads = Array.from({ length: 12 }, (_, i) => ({
      user: "racer",
      preferredName: i % 2 === 0 ? `User ${i}` : undefined,
      dietaryRestrictions: [DIETARY_TAGS[i % DIETARY_TAGS.length]],
      budgetPreferences: [BUDGET_TIERS[i % BUDGET_TIERS.length]],
      walkPreferenceMinutes: i % 3 === 0 ? undefined : i + 1,
      cuisinePreferences: [`Cuisine ${i}`],
      notes: i % 4 === 0 ? undefined : `Note ${i}`,
    }));

    await Promise.all(payloads.map((payload) => profiling.setProfile(payload)));

    const rows = await profiling._getProfile({ user: "racer" });
    expect(rows).toHaveLength(1);
    const matchingPayload = payloads.find(
      (p) =>
        p.preferredName === rows[0].preferredName &&
        p.walkPreferenceMinutes === rows[0].walkPreferenceMinutes &&
        p.notes === rows[0].notes &&
        p.dietaryRestrictions[0] === rows[0].dietaryRestrictions[0] &&
        p.budgetPreferences[0] === rows[0].budgetPreferences[0] &&
        p.cuisinePreferences[0] === rows[0].cuisinePreferences[0],
    );
    expect(matchingPayload).toBeDefined();
  });
});
