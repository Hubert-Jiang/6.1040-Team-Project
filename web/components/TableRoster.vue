<script lang="ts">
export const DIETARY_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "VEGAN", label: "Vegan" },
  { value: "HALAL", label: "Halal" },
  { value: "KOSHER", label: "Kosher" },
  { value: "GLUTEN_FREE", label: "Gluten-free" },
  { value: "DAIRY_FREE", label: "Dairy-free" },
  { value: "NUT_FREE", label: "Nut-free" },
  { value: "SHELLFISH_FREE", label: "Shellfish-free" },
] as const;

export const BUDGET_OPTIONS = [
  { value: "FREE", label: "Free" },
  { value: "BUDGET", label: "Budget ($)" },
  { value: "MODERATE", label: "Moderate ($$)" },
  { value: "UPSCALE", label: "Upscale ($$$)" },
] as const;

export type DietaryRestriction = (typeof DIETARY_OPTIONS)[number]["value"];
export type BudgetPreference = (typeof BUDGET_OPTIONS)[number]["value"];

export interface RosterParticipant {
  user: string;
  displayName: string;
  preferredName?: string | null;
  dietaryRestrictions?: readonly string[] | null;
  budgetPreferences?: readonly string[] | null;
  walkPreferenceMinutes?: number | null;
  cuisinePreferences?: readonly string[] | null;
  notes?: string | null;
}

export interface TableRosterData {
  host: RosterParticipant;
  seated: readonly RosterParticipant[];
}

const DIETARY_LABELS: Record<string, string> = Object.fromEntries(
  DIETARY_OPTIONS.map((option) => [option.value, option.label]),
);

const BUDGET_LABELS: Record<string, string> = Object.fromEntries(
  BUDGET_OPTIONS.map((option) => [option.value, option.label]),
);
</script>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  roster: TableRosterData | null;
  loading?: boolean;
  error?: string;
  editProfileTo?: string;
}>();

const entries = computed(() => {
  if (!props.roster) return [];
  return [
    { ...props.roster.host, role: "Host" as const },
    ...props.roster.seated.map((guest) => ({ ...guest, role: "Seated" as const })),
  ];
});

function formatDietary(code: string): string {
  return DIETARY_LABELS[code] ?? code;
}

function formatBudget(code: string): string {
  return BUDGET_LABELS[code] ?? code;
}

function hasTags(participant: RosterParticipant): boolean {
  return Boolean(
    (participant.dietaryRestrictions && participant.dietaryRestrictions.length > 0) ||
      (participant.budgetPreferences && participant.budgetPreferences.length > 0) ||
      participant.walkPreferenceMinutes != null ||
      (participant.cuisinePreferences && participant.cuisinePreferences.length > 0),
  );
}

function hasPreferences(participant: RosterParticipant): boolean {
  return hasTags(participant) || Boolean(participant.notes && participant.notes.trim().length > 0);
}
</script>

<template>
  <section class="card stack">
    <div class="row">
      <strong>Who's at this table</strong>
      <RouterLink v-if="editProfileTo" :to="editProfileTo" class="link-btn small">Edit profile</RouterLink>
    </div>

    <p v-if="loading && !roster" class="muted">Loading tablemates…</p>
    <p v-else-if="error && !roster" class="error" role="alert">{{ error }}</p>

    <template v-else-if="roster">
      <ul class="roster-list">
        <li v-for="entry in entries" :key="`${entry.role}-${entry.user}`" class="roster-item">
          <div class="row">
            <strong>{{ entry.displayName }}</strong>
            <span class="badge">{{ entry.role }}</span>
          </div>

          <template v-if="hasPreferences(entry)">
            <div v-if="hasTags(entry)" class="pref-tags">
              <span v-for="diet in entry.dietaryRestrictions ?? []" :key="`d-${diet}`" class="pref-tag">
                {{ formatDietary(diet) }}
              </span>
              <span v-for="budget in entry.budgetPreferences ?? []" :key="`b-${budget}`" class="pref-tag">
                {{ formatBudget(budget) }}
              </span>
              <span v-if="entry.walkPreferenceMinutes != null" class="pref-tag">
                Up to {{ entry.walkPreferenceMinutes }} min travel
              </span>
              <span v-for="cuisine in entry.cuisinePreferences ?? []" :key="`c-${cuisine}`" class="pref-tag">
                {{ cuisine }}
              </span>
            </div>
            <p v-if="entry.notes" class="muted small roster-notes">{{ entry.notes }}</p>
          </template>
          <div v-else class="muted small">No preferences added yet</div>
        </li>
      </ul>
      <p v-if="roster.seated.length === 0" class="muted small">No seated guests yet.</p>
      <p v-if="error" class="error small" role="alert">{{ error }}</p>
    </template>
  </section>
</template>
