<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, getStoredSession, logoutCurrentSession, setStoredSession } from "../auth-client.ts";

const route = useRoute();
const router = useRouter();
const tables = ref<{ gathering: string; title: string; status: string; startTime: string }[]>([]);
const form = reactive({ title: "", area: "", startTime: "", endTime: "", cutoffTime: "", capacity: 4, confirmedVenue: "", details: "" });
const busy = ref(false);
const errorMessage = ref("");

// what each refusal of a create means to the host
const refusals: Record<string, string> = {
  INVALID_REQUEST: "Check the title, area, and times. RSVPs have to close in the future and before the start, and the start has to come before the end.",
  CONFLICT: "You already have 3 active tables. Book or cancel one first.",
  UNAUTHORIZED: "Your session ended. Sign in again.",
};

// a datetime-local field holds local time with no zone, and the server takes a full timestamp
const timestamp = (local: string) => (local ? new Date(local).toISOString() : "");
const shown = (time: string) => new Date(time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

async function handleUnauthorized() {
  setStoredSession(null);
  authState.user = null;
  authState.checked = true;
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}

async function loadTables() {
  const result = await client.gatherings.mine({ session: getStoredSession() ?? "" });
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") await handleUnauthorized();
    return;
  }
  tables.value = result.hosted.tables;
}
onMounted(loadTables);

async function createTable() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  const result = await client.gatherings.create({
    session: getStoredSession() ?? "",
    title: form.title,
    area: form.area,
    startTime: timestamp(form.startTime),
    endTime: timestamp(form.endTime),
    cutoffTime: timestamp(form.cutoffTime),
    capacity: form.capacity,
    confirmedVenue: form.confirmedVenue,
    details: form.details,
  });
  busy.value = false;
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") {
      await handleUnauthorized();
      return;
    }
    errorMessage.value = refusals[result.error] ?? "Could not create the table.";
    return;
  }
  await router.push(`/tables/${result.gathering}`);
}

async function signOut() {
  await logoutCurrentSession();
  await router.replace("/login");
}
</script>

<template>
  <main class="shell stack">
    <section class="card stack">
      <strong>My tables</strong>
      <div v-if="authState.user" class="muted">{{ authState.user.name ?? authState.user.email }}</div>
      <p v-if="tables.length === 0" class="muted">You have not created a table yet.</p>
      <RouterLink v-for="table in tables" :key="table.gathering" class="btn" :to="`/tables/${table.gathering}`">
        {{ table.title }}
        <span class="muted">· {{ table.status }} · {{ shown(table.startTime) }}</span>
      </RouterLink>
    </section>

    <form class="card stack" @submit.prevent="createTable">
      <strong>Create a table</strong>
      <label class="stack">Title <input v-model="form.title" required maxlength="100" /></label>
      <label class="stack">Area <input v-model="form.area" required maxlength="100" placeholder="Kendall Square" /></label>
      <label class="stack">RSVPs close <input v-model="form.cutoffTime" type="datetime-local" required /></label>
      <label class="stack">Event start <input v-model="form.startTime" type="datetime-local" required /></label>
      <label class="stack">Event close <input v-model="form.endTime" type="datetime-local" required /></label>
      <label class="stack">Guest spots <input v-model.number="form.capacity" type="number" min="1" step="1" required /></label>
      <label class="stack">Venue (optional) <input v-model="form.confirmedVenue" maxlength="100" /></label>
      <label class="stack">Details (optional) <input v-model="form.details" maxlength="300" /></label>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Creating…" : "Create table" }}</button>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    </form>

    <button type="button" class="btn" @click="signOut">Sign out</button>
  </main>
</template>
