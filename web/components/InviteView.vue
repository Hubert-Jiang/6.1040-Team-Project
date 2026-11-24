<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, getStoredSession, logoutCurrentSession, refreshAuth, setStoredSession } from "../auth-client.ts";
import { createLiveRefresher } from "../live-refresh.ts";
import TablePoll, {
  checkAddPollOption,
  resolvePollActionError,
  type PollActionKind,
  type TablePollData,
} from "./TablePoll.vue";
import TableRoster, { type TableRosterData } from "./TableRoster.vue";

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
const roster = ref<TableRosterData | null>(null);
const rosterLoading = ref(false);
const rosterError = ref("");
const poll = ref<TablePollData | null>(null);
const pollLoading = ref(false);
const pollBusy = ref(false);
const pollError = ref("");
let loadGeneration = 0;

const session = () => getStoredSession() ?? "";
const signedIn = computed(() => authState.user !== null);
const seated = computed(() => Boolean(place.value?.reservation));
const waitlisted = computed(() => place.value?.position != null);
const isActiveTable = (status: string) => status === "OPEN" || status === "CONFIRMED" || status === "BOOKED";
const canViewRoster = computed(() =>
  Boolean(signedIn.value && table.value && isActiveTable(table.value.status) && (hosting.value || seated.value)),
);
const profileReturnTo = computed(() => `/profile?returnTo=${encodeURIComponent(route.fullPath)}`);
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

function clearRoster() {
  roster.value = null;
  rosterLoading.value = false;
  rosterError.value = "";
}

function clearPoll() {
  poll.value = null;
  pollLoading.value = false;
  pollError.value = "";
}

function clearSignedInState() {
  setStoredSession(null);
  authState.user = null;
  authState.checked = true;
  hosting.value = false;
  hostAcceptAttempted.value = false;
  place.value = null;
  clearRoster();
  clearPoll();
}

async function loadMine(generation = loadGeneration) {
  if (!table.value || !signedIn.value) return;
  const currentToken = token.value;
  const mine = await client.api.tables.place({ session: session(), gathering: table.value.gathering });
  if (generation !== loadGeneration || token.value !== currentToken) return;
  if ("error" in mine) {
    if (mine.error === "UNAUTHORIZED") {
      clearSignedInState();
    }
    return;
  }
  hosting.value = mine.hosting;
  if (!mine.hosting) {
    hostAcceptAttempted.value = false;
  }
  place.value = { reservation: mine.place.reservation ?? null, position: mine.place.position ?? null };
  if (!canViewRoster.value) {
    clearRoster();
    clearPoll();
  }
}

async function loadRoster(generation = loadGeneration, options: { background?: boolean } = {}) {
  if (!canViewRoster.value || !table.value) {
    clearRoster();
    return;
  }
  const currentToken = token.value;
  const gathering = table.value.gathering;
  if (!options.background && !roster.value) {
    rosterLoading.value = true;
  }
  const result = await client.api.tables.profiles({ session: session(), gathering });
  if (generation !== loadGeneration || token.value !== currentToken) return;
  rosterLoading.value = false;
  if (!canViewRoster.value) {
    clearRoster();
    return;
  }
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") {
      clearSignedInState();
      return;
    }
    if (result.error === "CONFLICT" || result.error === "FORBIDDEN" || result.error === "NOT_FOUND") {
      clearRoster();
      return;
    }
    if (!options.background || !roster.value) {
      rosterError.value = "Could not load tablemates right now.";
    }
    return;
  }
  rosterError.value = "";
  roster.value = { host: result.host, seated: result.seated };
}

async function loadPoll(generation = loadGeneration, options: { background?: boolean } = {}) {
  if (!canViewRoster.value || !table.value) {
    clearPoll();
    return;
  }
  const currentToken = token.value;
  const gathering = table.value.gathering;
  if (!options.background && !poll.value) {
    pollLoading.value = true;
  }
  const result = await client.api.tables.poll({ session: session(), gathering });
  if (generation !== loadGeneration || token.value !== currentToken) return;
  pollLoading.value = false;
  if (!canViewRoster.value) {
    clearPoll();
    return;
  }
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") {
      clearSignedInState();
      return;
    }
    if (result.error === "CONFLICT" || result.error === "FORBIDDEN" || result.error === "NOT_FOUND") {
      clearPoll();
      return;
    }
    if (!options.background || !poll.value) {
      pollError.value = "Could not load location poll right now.";
    }
    return;
  }
  pollError.value = "";
  poll.value = {
    open: result.open,
    confirmedVenue: result.confirmedVenue ?? null,
    hosting: result.hosting,
    votedOption: result.votedOption ?? null,
    options: result.options,
  };
}

async function runPollAction(
  action: PollActionKind,
  request: (gathering: string) => Promise<{ error: string } | object>,
  options: { attemptedLabel?: string; reloadTable?: boolean } = {},
) {
  if (pollBusy.value || !table.value) return;
  const currentToken = token.value;
  const gathering = table.value.gathering;
  const generation = loadGeneration;
  pollBusy.value = true;
  pollError.value = "";
  try {
    const result = await request(gathering);
    if (generation !== loadGeneration || token.value !== currentToken) return;
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        clearSignedInState();
        return;
      }
      if (result.error === "CONFLICT" || result.error === "NOT_FOUND" || result.error === "FORBIDDEN") {
        await loadTable({ background: true });
        if (generation !== loadGeneration || token.value !== currentToken) return;
        await loadMine(generation);
        if (generation !== loadGeneration || token.value !== currentToken) return;
        await loadPoll(generation, { background: true });
        if (generation !== loadGeneration || token.value !== currentToken) return;
      }
      pollError.value = resolvePollActionError(action, result.error, {
        poll: poll.value,
        tableActive: table.value ? isActiveTable(table.value.status) : false,
        attemptedLabel: options.attemptedLabel,
      });
      return;
    }
    if (options.reloadTable) {
      await loadTable({ background: true });
      if (generation !== loadGeneration || token.value !== currentToken) return;
    }
    await loadPoll(generation, { background: true });
  } finally {
    if (generation === loadGeneration && token.value === currentToken) {
      pollBusy.value = false;
    }
  }
}

async function addPollOption(rawLabel: string) {
  const check = checkAddPollOption(poll.value, rawLabel);
  if (check.error) {
    pollError.value = check.error;
    return;
  }
  await runPollAction(
    "add",
    (gathering) => client.api.tables.poll.add({ session: session(), gathering, label: check.trimmed }),
    { attemptedLabel: check.trimmed },
  );
}

async function votePollOption(option: string) {
  await runPollAction("vote", (gathering) => client.api.tables.poll.vote({ session: session(), gathering, option }));
}

async function unvotePollOption() {
  await runPollAction("unvote", (gathering) => client.api.tables.poll.unvote({ session: session(), gathering }));
}

async function removePollOption(option: string) {
  await runPollAction("remove", (gathering) => client.api.tables.poll.remove({ session: session(), gathering, option }));
}

async function choosePollVenue(option: string) {
  await runPollAction(
    "chooseVenue",
    (gathering) => client.api.tables.poll["choose-venue"]({ session: session(), gathering, option }),
    { reloadTable: true },
  );
}

async function refreshLive() {
  if (busy.value || pollBusy.value || notFound.value || !table.value) return;
  const generation = loadGeneration;
  const ok = await loadTable({ background: true });
  if (!ok || generation !== loadGeneration || busy.value || pollBusy.value || notFound.value || !table.value) {
    if (!table.value || !isActiveTable(table.value?.status ?? "")) {
      clearRoster();
      clearPoll();
    }
    return;
  }
  if (signedIn.value) {
    await loadMine(generation);
    if (generation !== loadGeneration || busy.value || pollBusy.value) return;
    if (canViewRoster.value) {
      await Promise.all([loadRoster(generation, { background: true }), loadPoll(generation, { background: true })]);
    } else {
      clearRoster();
      clearPoll();
    }
  } else {
    clearRoster();
    clearPoll();
  }
}

const refresher = createLiveRefresher({
  refresh: refreshLive,
  isPaused: () => busy.value || pollBusy.value || notFound.value || !table.value,
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
    if (canViewRoster.value) {
      await Promise.all([loadRoster(loadGeneration), loadPoll(loadGeneration)]);
    }
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
    clearRoster();
    clearPoll();
    message.value = "You withdrew. You can accept again while the table is open.";
    await Promise.all([loadTable(), loadMine()]);
  } finally {
    busy.value = false;
  }
}




async function signOut() {
  clearRoster();
  clearPoll();
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
  clearRoster();
  clearPoll();
  pollBusy.value = false;
}

async function initForToken() {
  const generation = loadGeneration;
  if (!authState.checked) await refreshAuth();
  if (generation !== loadGeneration) return;
  await loadTable();
  if (generation !== loadGeneration) return;
  await loadMine(generation);
  if (generation !== loadGeneration) return;
  if (canViewRoster.value) {
    await Promise.all([loadRoster(generation), loadPoll(generation)]);
  }
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
  <main class="shell stack">
    <section class="card stack">
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
      </template>

      <p v-else class="muted">Loading…</p>
    </section>

    <TablePoll
      v-if="canViewRoster"
      :poll="poll"
      :loading="pollLoading"
      :busy="pollBusy"
      :error="pollError"
      @add="addPollOption"
      @vote="votePollOption"
      @unvote="unvotePollOption"
      @remove="removePollOption"
      @choose-venue="choosePollVenue"
    />

    <TableRoster
      v-if="canViewRoster"
      :roster="roster"
      :loading="rosterLoading"
      :error="rosterError"
      :edit-profile-to="profileReturnTo"
    />

    <p v-if="signedIn && authState.user" class="muted small">
      Signed in as {{ authState.user.email }} ·
      <RouterLink :to="profileReturnTo" class="link-btn">Dining profile</RouterLink> ·
      <button type="button" class="link-btn" @click="signOut">Sign out</button>
    </p>
  </main>
</template>
