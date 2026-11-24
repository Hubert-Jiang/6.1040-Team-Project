<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, getStoredSession, logoutCurrentSession, refreshAuth, setStoredSession } from "../auth-client.ts";
import { createLiveRefresher } from "../live-refresh.ts";

interface TableDetails {
  gathering: string;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  cutoffTime: string;
  details?: string | null;
  scope?: string | null;
  area: string;
  confirmedVenue?: string | null;
  capacity: number;
  reservedCount: number;
  remaining: number;
  waitlistCount: number;
  locked: boolean;
}

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token ?? ""));

const table = ref<TableDetails | null>(null);
const notFound = ref(false);
const hosting = ref(false);
const hostAcceptAttempted = ref(false);
const place = ref<{ reservation: string | null; position: number | null } | null>(null);
const busy = ref(false);
const message = ref("");
const errorMessage = ref("");
let loadGeneration = 0;

const session = () => getStoredSession() ?? "";
const signedIn = computed(() => authState.user !== null);
const seated = computed(() => Boolean(place.value?.reservation));
const waitlisted = computed(() => place.value?.position != null);
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function loadTable(options: { background?: boolean } = {}): Promise<boolean> {
  const currentToken = token.value;
  const generation = loadGeneration;
  const view = await client.api.tables.view({ token: currentToken });
  if (generation !== loadGeneration || token.value !== currentToken) return false;
  if ("error" in view) {
    if (!options.background || view.error === "NOT_FOUND") {
      notFound.value = true;
      table.value = null;
    }
    return false;
  }
  notFound.value = false;
  table.value = { ...view, startTime: String(view.startTime), endTime: String(view.endTime), cutoffTime: String(view.cutoffTime) } as TableDetails;
  return true;
}

async function loadMine(generation = loadGeneration) {
  if (!table.value || !signedIn.value) return;
  const currentToken = token.value;
  const mine = await client.api.tables.place({ session: session(), gathering: table.value.gathering });
  if (generation !== loadGeneration || token.value !== currentToken) return;
  if ("error" in mine) {
    if (mine.error === "UNAUTHORIZED") {
      setStoredSession(null);
      authState.user = null;
      authState.checked = true;
      hosting.value = false;
      hostAcceptAttempted.value = false;
      place.value = null;
    }
    return;
  }
  hosting.value = mine.hosting;
  if (!mine.hosting) {
    hostAcceptAttempted.value = false;
  }
  place.value = { reservation: mine.place.reservation ?? null, position: mine.place.position ?? null };
}

async function refreshLive() {
  if (busy.value || notFound.value || !table.value) return;
  const generation = loadGeneration;
  const ok = await loadTable({ background: true });
  if (!ok || generation !== loadGeneration || busy.value || notFound.value || !table.value) return;
  if (signedIn.value) {
    await loadMine(generation);
  }
}

const refresher = createLiveRefresher({
  refresh: refreshLive,
  isPaused: () => busy.value || notFound.value || !table.value,
});


const ACCEPT_ERRORS: Record<string, string> = {
  CONFLICT: "You can't join right now: you already joined, you're the host, or the table is closed.",
  FORBIDDEN: "This table is only open to people with a matching email domain.",
  NOT_FOUND: "This link no longer works.",
  UNAUTHORIZED: "Your session ended. Sign in again.",
};

async function accept() {
  if (!signedIn.value) {
    // login keeps this path, so the accept finishes when the guest lands back here
    await router.push({ path: "/login", query: { redirect: `/invite/${token.value}?accept=1` } });
    return;
  }
  hostAcceptAttempted.value = false;
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await client.api.tables.accept({ session: session(), token: token.value });
    if ("error" in result) {
      if (result.error === "CONFLICT") {
        await loadMine();
        if (hosting.value) {
          hostAcceptAttempted.value = true;
          return;
        }
      }
      errorMessage.value = ACCEPT_ERRORS[result.error] ?? `Could not accept (${result.error}).`;
      return;
    }
    await Promise.all([loadTable(), loadMine()]);
  } finally {
    busy.value = false;
  }
}

async function withdraw() {
  if (!table.value) return;
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await client.api.tables.withdraw({ session: session(), gathering: table.value.gathering });
    if ("error" in result) {
      errorMessage.value = result.error === "CONFLICT" ? "Seats are locked, so you can no longer withdraw." : `Could not withdraw (${result.error}).`;
      return;
    }
    message.value = "You withdrew. You can accept again while the table is open.";
    await Promise.all([loadTable(), loadMine()]);
  } finally {
    busy.value = false;
  }
}




async function signOut() {
  await logoutCurrentSession();
  hosting.value = false;
  hostAcceptAttempted.value = false;
  place.value = null;
  message.value = "";
  errorMessage.value = "";
}

function resetForToken() {
  loadGeneration += 1;
  table.value = null;
  notFound.value = false;
  hosting.value = false;
  hostAcceptAttempted.value = false;
  place.value = null;
  message.value = "";
  errorMessage.value = "";
}

async function initForToken() {
  const generation = loadGeneration;
  if (!authState.checked) await refreshAuth();
  if (generation !== loadGeneration) return;
  await loadTable();
  if (generation !== loadGeneration) return;
  await loadMine(generation);
  if (generation !== loadGeneration) return;
  if (route.query.accept === "1") {
    await router.replace({ path: route.path });
    if (generation !== loadGeneration) return;
    if (table.value && signedIn.value && hosting.value) {
      hostAcceptAttempted.value = true;
    } else if (table.value && signedIn.value && !seated.value && !waitlisted.value) {
      await accept();
    }
  }
}

onMounted(async () => {
  await initForToken();
  refresher.start();
});

watch(token, async (next, prev) => {
  if (next === prev || !next) return;
  refresher.stop();
  resetForToken();
  await initForToken();
  refresher.start();
});

onUnmounted(() => {
  refresher.stop();
});
</script>

<template>
  <main class="shell card stack">
    <RouterLink v-if="signedIn" to="/" class="muted">← Your tables</RouterLink>

    <template v-if="notFound">
      <strong>This link doesn't work</strong>
      <p class="muted">It may have been turned off by the host, or mistyped.</p>
    </template>

    <template v-else-if="table">
      <div>
        <strong class="title">{{ table.title }}</strong>
        <div class="muted">{{ table.area }}<template v-if="table.confirmedVenue"> · {{ table.confirmedVenue }}</template></div>
      </div>
      <div class="muted">
        <div>{{ when(table.startTime) }} to {{ when(table.endTime) }}</div>
        <div>RSVP by {{ when(table.cutoffTime) }}</div>
        <div v-if="table.scope">Only for @{{ table.scope }} emails</div>
      </div>
      <p v-if="table.details">{{ table.details }}</p>

      <div class="seats">
        <strong>{{ table.remaining }} of {{ table.capacity }} seats left</strong>
        <span v-if="table.waitlistCount" class="muted"> · {{ table.waitlistCount }} on the waitlist</span>
        <div v-if="table.status !== 'OPEN' && table.status !== 'CONFIRMED'" class="muted">This table is {{ table.status.toLowerCase() }}.</div>
        <div v-else-if="table.locked" class="muted">Seats are locked.</div>
      </div>

      <template v-if="hosting">
        <p v-if="hostAcceptAttempted" class="error">You're hosting this table, so no seat was accepted.</p>
        <p v-else class="muted">You're hosting this table.</p>
        <RouterLink class="btn" :to="`/tables/${table.gathering}`">Manage this table and its links</RouterLink>
      </template>

      <template v-else-if="seated">
        <p><strong>You have a seat.</strong></p>
        <button type="button" class="btn" :disabled="busy" @click="withdraw">Withdraw</button>
      </template>

      <template v-else-if="waitlisted">
        <p><strong>You're #{{ place?.position }} on the waitlist.</strong> You'll get the next seat that frees up.</p>
        <button type="button" class="btn" :disabled="busy" @click="withdraw">Leave the waitlist</button>
      </template>

      <template v-else>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="accept">
          {{ signedIn ? (table.remaining > 0 ? "Accept a seat" : "Join the waitlist") : "Accept (you'll sign in first)" }}
        </button>
      </template>

      <p v-if="message" class="muted">{{ message }}</p>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="signedIn && authState.user" class="muted small">
        Signed in as {{ authState.user.email }} ·
        <button type="button" class="link-btn" @click="signOut">Sign out</button>
      </p>
    </template>

    <p v-else class="muted">Loading…</p>
  </main>
</template>
