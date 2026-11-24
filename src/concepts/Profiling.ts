import { type Collection, type Db, MongoServerError } from "mongodb";

export class InvalidDistance extends Error {}
export class InvalidProfile extends Error {}

export const DIETARY_TAGS = [
  "VEGETARIAN",
  "VEGAN",
  "HALAL",
  "KOSHER",
  "GLUTEN_FREE",
  "DAIRY_FREE",
  "NUT_FREE",
  "SHELLFISH_FREE",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const BUDGET_TIERS = ["FREE", "BUDGET", "MODERATE", "UPSCALE"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

const DIETARY_TAG_SET = new Set<string>(DIETARY_TAGS);
const BUDGET_TIER_SET = new Set<string>(BUDGET_TIERS);

const MAX_PREFERRED_NAME_LENGTH = 80;
const MAX_NOTES_LENGTH = 500;
const MAX_CUISINE_LENGTH = 50;
const MAX_CUISINES = 20;

interface ProfileDoc {
  _id: string;
  preferredName?: string;
  dietaryRestrictions: DietaryTag[];
  budgetPreferences: BudgetTier[];
  walkPreferenceMinutes?: number;
  cuisinePreferences: string[];
  notes?: string;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEnumSet<T extends string>(values: unknown, allowed: Set<string>): T[] {
  if (!Array.isArray(values)) {
    throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
  }
  const seen = new Set<T>();
  const result: T[] = [];
  for (const entry of values) {
    if (typeof entry !== "string" || !allowed.has(entry)) {
      throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
    }
    const typed = entry as T;
    if (!seen.has(typed)) {
      seen.add(typed);
      result.push(typed);
    }
  }
  return result;
}

function normalizeCuisines(values: unknown): string[] {
  if (!Array.isArray(values)) {
    throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > MAX_CUISINE_LENGTH) {
      throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  if (result.length > MAX_CUISINES) {
    throw new InvalidProfile("Profile contains an invalid dietary tag, budget tier, or text exceeding length limits.");
  }
  return result;
}

/** Stores each user's self-reported preferred name and optional flexible dining preferences. */
export class ProfilingConcept {
  private readonly profiles: Collection<ProfileDoc>;

  constructor(database: Db, name = "Profiling") {
    this.profiles = database.collection(`${name.toLowerCase()}.profiles`);
  }

  /** Saves or replaces the user's normalized dining profile. */
  async setProfile(input: {
    user: string;
    preferredName?: string;
    dietaryRestrictions: DietaryTag[];
    budgetPreferences: BudgetTier[];
    walkPreferenceMinutes?: number;
    cuisinePreferences: string[];
    notes?: string;
  }) {
    const { user, walkPreferenceMinutes } = input;

    if (
      walkPreferenceMinutes !== undefined &&
      walkPreferenceMinutes !== null &&
      (typeof walkPreferenceMinutes !== "number" ||
        !Number.isFinite(walkPreferenceMinutes) ||
        walkPreferenceMinutes <= 0)
    ) {
      throw new InvalidDistance("Preferred travel time must be a positive number.");
    }

    const dietaryRestrictions = normalizeEnumSet<DietaryTag>(input.dietaryRestrictions, DIETARY_TAG_SET);
    const budgetPreferences = normalizeEnumSet<BudgetTier>(input.budgetPreferences, BUDGET_TIER_SET);
    const preferredName = normalizeOptionalText(input.preferredName, MAX_PREFERRED_NAME_LENGTH);
    const notes = normalizeOptionalText(input.notes, MAX_NOTES_LENGTH);
    const cuisinePreferences = normalizeCuisines(input.cuisinePreferences);

    const doc: ProfileDoc = {
      _id: user,
      dietaryRestrictions,
      budgetPreferences,
      cuisinePreferences,
    };
    if (preferredName !== undefined) doc.preferredName = preferredName;
    if (walkPreferenceMinutes !== undefined && walkPreferenceMinutes !== null) {
      doc.walkPreferenceMinutes = walkPreferenceMinutes;
    }
    if (notes !== undefined) doc.notes = notes;

    try {
      await this.profiles.replaceOne({ _id: user }, doc, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      await this.profiles.replaceOne({ _id: user }, doc, { upsert: true });
    }
    return {};
  }

  /** Removes any stored profile for the user; harmless if none exists. */
  async clearProfile({ user }: { user: string }) {
    if (typeof user === "string" && user) {
      await this.profiles.deleteOne({ _id: user });
    }
    return {};
  }

  /** Returns the user's stored profile in one row, or no rows if absent. */
  async _getProfile({ user }: { user: string }) {
    if (typeof user !== "string" || !user) return [];
    const found = await this.profiles.findOne({ _id: user });
    if (!found) return [];
    return [
      {
        preferredName: found.preferredName,
        dietaryRestrictions: found.dietaryRestrictions,
        budgetPreferences: found.budgetPreferences,
        walkPreferenceMinutes: found.walkPreferenceMinutes,
        cuisinePreferences: found.cuisinePreferences,
        notes: found.notes,
      },
    ];
  }
}
