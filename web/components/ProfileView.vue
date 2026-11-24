<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, getStoredSession, logoutCurrentSession, sanitizeRedirect, setStoredSession } from "../auth-client.ts";
import {
  BUDGET_OPTIONS,
  DIETARY_OPTIONS,
  type BudgetPreference,
  type DietaryRestriction,
} from "./TableRoster.vue";

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const loadError = ref("");
const busy = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");
const addingCuisine = ref(false);
const newCuisine = ref("");
const cuisineInput = ref<HTMLInputElement | null>(null);

const accountEmail = ref(authState.user?.email ?? "");
const accountName = ref<string | null>(authState.user?.name ?? null);

const form = reactive<{
  preferredName: string;
  dietaryRestrictions: DietaryRestriction[];
  budgetPreferences: BudgetPreference[];
  walkMinutes: string;
  cuisines: string[];
  notes: string;
}>({
  preferredName: "",
  dietaryRestrictions: [],
  budgetPreferences: [],
  walkMinutes: "",
  cuisines: [],
  notes: "",
});

const rawReturnTo = computed(() => (typeof route.query.returnTo === "string" ? route.query.returnTo.trim() : ""));
const hasReturnTo = computed(() => rawReturnTo.value.length > 0);
const backTo = computed(() => (hasReturnTo.value ? sanitizeRedirect(rawReturnTo.value) : "/"));
const backLabel = computed(() => (hasReturnTo.value ? "Back" : "Your tables"));

const displayNamePreview = computed(
  () => form.preferredName.trim() || accountName.value?.trim() || accountEmail.value || authState.user?.name || authState.user?.email || "",
);

const session = () => getStoredSession() ?? "";

async function handleUnauthorized() {
  setStoredSession(null);
  authState.user = null;
  authState.checked = true;
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}

function applyLoadedProfile(profile: {
  email: string;
  accountName: string | null;
  preferredName?: string | null;
  dietaryRestrictions: readonly string[];
  budgetPreferences: readonly string[];
  walkPreferenceMinutes?: number | null;
  cuisinePreferences: readonly string[];
  notes?: string | null;
}) {
  accountEmail.value = profile.email;
  accountName.value = profile.accountName;
  form.preferredName = profile.preferredName ?? "";
  form.dietaryRestrictions = profile.dietaryRestrictions.filter((item): item is DietaryRestriction =>
    DIETARY_OPTIONS.some((option) => option.value === item),
  );
  form.budgetPreferences = profile.budgetPreferences.filter((item): item is BudgetPreference =>
    BUDGET_OPTIONS.some((option) => option.value === item),
  );
  form.walkMinutes = profile.walkPreferenceMinutes != null ? String(profile.walkPreferenceMinutes) : "";
  form.cuisines = [...profile.cuisinePreferences];
  form.notes = profile.notes ?? "";
}

async function loadProfile() {
  loading.value = true;
  loadError.value = "";
  const result = await client.api.profiles.me({ session: session() });
  loading.value = false;
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") {
      await handleUnauthorized();
      return;
    }
    loadError.value = "Could not load your dining profile. Please try again.";
    return;
  }
  applyLoadedProfile(result);
}

onMounted(loadProfile);

function toggleDietary(value: DietaryRestriction) {
  const index = form.dietaryRestrictions.indexOf(value);
  if (index >= 0) {
    form.dietaryRestrictions.splice(index, 1);
  } else {
    form.dietaryRestrictions.push(value);
  }
}

function toggleBudget(value: BudgetPreference) {
  const index = form.budgetPreferences.indexOf(value);
  if (index >= 0) {
    form.budgetPreferences.splice(index, 1);
  } else {
    form.budgetPreferences.push(value);
  }
}

async function startAddingCuisine() {
  addingCuisine.value = true;
  await nextTick();
  cuisineInput.value?.focus();
}

function cancelAddingCuisine() {
  newCuisine.value = "";
  addingCuisine.value = false;
}

function commitCuisineInput(): boolean {
  const trimmed = newCuisine.value.trim();
  if (!trimmed) {
    newCuisine.value = "";
    addingCuisine.value = false;
    return true;
  }
  if (trimmed.length > 50) {
    errorMessage.value = "Each cuisine preference must be 50 characters or fewer.";
    return false;
  }
  if (!form.cuisines.includes(trimmed)) {
    if (form.cuisines.length >= 20) {
      errorMessage.value = "You can add up to 20 cuisine preferences.";
      return false;
    }
    form.cuisines.push(trimmed);
  }
  errorMessage.value = "";
  newCuisine.value = "";
  addingCuisine.value = false;
  return true;
}

function removeCuisine(index: number) {
  form.cuisines.splice(index, 1);
}

async function saveProfile() {
  if (busy.value) return;
  statusMessage.value = "";
  errorMessage.value = "";

  if (addingCuisine.value && !commitCuisineInput()) {
    return;
  }

  const walkRaw = String(form.walkMinutes ?? "").trim();
  let walkPreferenceMinutes: number | undefined;
  if (walkRaw.length > 0) {
    const parsed = Number(walkRaw);
    if (!Number.isFinite(parsed)) {
      errorMessage.value = "Max travel time must be a positive whole number of minutes.";
      return;
    }
    walkPreferenceMinutes = parsed;
  }

  busy.value = true;
  try {
    const result = await client.api.profiles.save({
      session: session(),
      preferredName: form.preferredName.trim() || undefined,
      dietaryRestrictions: [...form.dietaryRestrictions],
      budgetPreferences: [...form.budgetPreferences],
      walkPreferenceMinutes,
      cuisinePreferences: [...form.cuisines],
      notes: form.notes.trim() || undefined,
    });
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        await handleUnauthorized();
        return;
      }
      errorMessage.value =
        result.error === "INVALID_REQUEST"
          ? "Check your entries: travel time must be a positive whole number, preferred name up to 80 characters, and notes up to 500 characters."
          : "Could not reach the server. Please try again.";
      return;
    }
    await loadProfile();
    if (!loadError.value) {
      statusMessage.value = "Profile saved.";
    }
  } finally {
    busy.value = false;
  }
}

async function clearProfile() {
  if (busy.value) return;
  statusMessage.value = "";
  errorMessage.value = "";
  busy.value = true;
  try {
    const result = await client.api.profiles.clear({ session: session() });
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        await handleUnauthorized();
        return;
      }
      errorMessage.value =
        result.error === "INVALID_REQUEST" ? "Could not clear your profile." : "Could not reach the server. Please try again.";
      return;
    }
    form.preferredName = "";
    form.dietaryRestrictions = [];
    form.budgetPreferences = [];
    form.walkMinutes = "";
    form.cuisines = [];
    addingCuisine.value = false;
    newCuisine.value = "";
    form.notes = "";
    await loadProfile();
    if (!loadError.value) {
      statusMessage.value = "Profile cleared.";
    }
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  await logoutCurrentSession();
  await router.replace("/login");
}
</script>

<template>
  <main class="shell stack">
    <section class="card stack">
      <RouterLink :to="backTo" class="muted">← {{ backLabel }}</RouterLink>
      <div>
        <strong class="title">Dining profile</strong>
        <p class="muted small">All fields are optional. Hosts and seated tablemates can see your preferences on active tables.</p>
      </div>

      <p v-if="loading" class="muted">Loading profile…</p>
      <div v-else-if="loadError" class="stack">
        <p class="error" role="alert">{{ loadError }}</p>
        <button type="button" class="btn" @click="loadProfile">Try again</button>
      </div>

      <template v-else>
        <div class="seats stack">
          <div class="small">
            <span class="muted">Shown on tables as: </span>
            <strong>{{ displayNamePreview }}</strong>
          </div>
          <div class="muted small">
            {{ accountEmail }}
            <template v-if="accountName"> · Touchstone: {{ accountName }}</template>
          </div>
        </div>

        <form class="stack" @submit.prevent="saveProfile">
          <label class="field">
            <span>Preferred name (optional)</span>
            <input
              v-model="form.preferredName"
              type="text"
              maxlength="80"
              placeholder="Defaults to your Touchstone name or email"
            />
          </label>

          <div class="field">
            <span>Dietary restrictions</span>
            <div class="chip-group">
              <button
                v-for="option in DIETARY_OPTIONS"
                :key="option.value"
                type="button"
                :class="['chip', { selected: form.dietaryRestrictions.includes(option.value) }]"
                :aria-pressed="form.dietaryRestrictions.includes(option.value)"
                @click="toggleDietary(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="field">
            <span>Budget flexibility</span>
            <div class="chip-group">
              <button
                v-for="option in BUDGET_OPTIONS"
                :key="option.value"
                type="button"
                :class="['chip', { selected: form.budgetPreferences.includes(option.value) }]"
                :aria-pressed="form.budgetPreferences.includes(option.value)"
                @click="toggleBudget(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <label class="field">
            <span>Max travel time (minutes, optional)</span>
            <input v-model="form.walkMinutes" type="number" min="1" step="1" placeholder="e.g. 15" />
          </label>

          <div class="field">
            <span>Cuisine preferences (optional)</span>
            <div class="chip-group">
              <span
                v-for="(cuisine, index) in form.cuisines"
                :key="cuisine"
                class="chip selected chip-tag"
              >
                <span>{{ cuisine }}</span>
                <button
                  type="button"
                  class="chip-remove"
                  :aria-label="`Remove ${cuisine}`"
                  @click="removeCuisine(index)"
                >
                  ×
                </button>
              </span>
              <button
                v-if="!addingCuisine"
                type="button"
                class="chip chip-add"
                aria-label="Add cuisine preference"
                @click="startAddingCuisine"
              >
                +
              </button>
            </div>
            <div v-if="addingCuisine" class="cuisine-add-row">
              <input
                ref="cuisineInput"
                v-model="newCuisine"
                type="text"
                maxlength="50"
                placeholder="e.g. Thai"
                aria-label="New cuisine preference"
                @keydown.enter.prevent="commitCuisineInput"
                @keydown.escape.prevent="cancelAddingCuisine"
              />
              <button type="button" class="btn btn-small" @click="commitCuisineInput">Add</button>
            </div>
          </div>

          <label class="field">
            <span>Notes (optional)</span>
            <textarea
              v-model="form.notes"
              class="textarea"
              maxlength="500"
              rows="3"
              placeholder="Anything else for tablemates, e.g. mild spice"
            />
          </label>

          <button type="submit" class="btn btn-primary" :disabled="busy">
            {{ busy ? "Saving…" : "Save profile" }}
          </button>
          <button type="button" class="btn" :disabled="busy" @click="clearProfile">
            Clear profile
          </button>

          <p v-if="statusMessage" class="success" role="status">{{ statusMessage }}</p>
          <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        </form>
      </template>
    </section>

    <p v-if="authState.user" class="muted small">
      Signed in as {{ authState.user.email }} ·
      <button type="button" class="link-btn" @click="signOut">Sign out</button>
    </p>
  </main>
</template>
