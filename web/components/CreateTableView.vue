<script setup lang="ts">
import { computed, ref } from "vue";
import { authState, client, getStoredSession } from "../auth-client.ts";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
function localInput(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const title = ref("");
const area = ref("");
const cutoff = ref(localInput(24));
const start = ref(localInput(26));
const end = ref(localInput(28));
const capacity = ref(4);
const details = ref("");
const venue = ref("");
const onlyMyDomain = ref(false);
const linkLabel = ref("");

const busy = ref(false);
const errorMessage = ref("");
const created = ref<{ token: string } | null>(null);
const copied = ref(false);

const shareUrl = computed(() => (created.value ? `${window.location.origin}/t/${created.value.token}` : ""));
const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

const ERRORS: Record<string, string> = {
  INVALID_REQUEST: "Check the form: a title and area are required, the cutoff must be in the future and before the start, the start before the end, and seats from 1 to 50.",
  CONFLICT: "You already host 3 active tables. Cancel or finish one first.",
  FORBIDDEN: "You can only limit a table to your own email domain.",
  UNAUTHORIZED: "Your session ended. Sign in again.",
};

async function submit() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  const result = await client.api.tables.create({
    session: getStoredSession() ?? "",
    title: title.value,
    area: area.value,
    cutoffTime: new Date(cutoff.value).toISOString(),
    startTime: new Date(start.value).toISOString(),
    endTime: new Date(end.value).toISOString(),
    capacity: Number(capacity.value),
    details: blankToNull(details.value),
    confirmedVenue: blankToNull(venue.value),
    scope: onlyMyDomain.value ? (authState.user?.domain ?? null) : null,
    linkLabel: blankToNull(linkLabel.value),
  });
  busy.value = false;
  if ("error" in result) {
    errorMessage.value = ERRORS[result.error] ?? `Could not create the table (${result.error}).`;
    return;
  }
  created.value = { token: result.token };
}

async function copy() {
  await navigator.clipboard.writeText(shareUrl.value);
  copied.value = true;
}
</script>

<template>
  <main class="shell card stack">
    <RouterLink to="/" class="muted">← Your tables</RouterLink>

    <template v-if="created">
      <strong>Your table is up</strong>
      <p class="muted">Share this link in a group chat. Anyone with it can see the table and accept a seat.</p>
      <input class="input" :value="shareUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
      <button type="button" class="btn" @click="copy">{{ copied ? "Copied" : "Copy link" }}</button>
      <RouterLink class="btn btn-primary" :to="`/t/${created.token}`">Open the table page</RouterLink>
    </template>

    <form v-else class="stack" @submit.prevent="submit">
      <strong>Host a new table</strong>
      <label class="field">Title<input v-model="title" class="input" placeholder="Thanksgiving dinner" /></label>
      <label class="field">Area<input v-model="area" class="input" placeholder="Central Square" /></label>
      <label class="field">Start<input v-model="start" class="input" type="datetime-local" /></label>
      <label class="field">End<input v-model="end" class="input" type="datetime-local" /></label>
      <label class="field">RSVP cutoff<input v-model="cutoff" class="input" type="datetime-local" /></label>
      <label class="field">Open seats (besides you)<input v-model="capacity" class="input" type="number" min="1" max="50" /></label>
      <label class="field">Restaurant, if you've picked one<input v-model="venue" class="input" placeholder="optional" /></label>
      <label class="field">Details<textarea v-model="details" class="input" rows="2" placeholder="optional, e.g. everyone pays for their own meal" /></label>
      <label class="field">Name for the first link<input v-model="linkLabel" class="input" placeholder="optional, e.g. Dorm group chat" /></label>
      <label class="check">
        <input v-model="onlyMyDomain" type="checkbox" />
        Only people with an @{{ authState.user?.domain ?? "your domain" }} email
      </label>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Creating…" : "Create table" }}</button>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </form>
  </main>
</template>
