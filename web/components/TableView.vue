<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, getStoredSession, logoutCurrentSession, refreshAuth } from "../auth-client.ts";

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
interface LinkRow {
  link: string;
  token: string;
  label?: string | null;
  active: boolean;
}

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token ?? ""));

const table = ref<TableDetails | null>(null);
const notFound = ref(false);
const hosting = ref(false);
const place = ref<{ reservation: string | null; position: number | null } | null>(null);
const links = ref<LinkRow[]>([]);
const newLabel = ref("");
const busy = ref(false);
const message = ref("");
const errorMessage = ref("");

const session = () => getStoredSession() ?? "";
const signedIn = computed(() => authState.user !== null);
const seated = computed(() => Boolean(place.value?.reservation));
const waitlisted = computed(() => place.value?.position != null);
const shareUrl = (t: string) => `${window.location.origin}/t/${t}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function loadTable() {
  const view = await client.api.tables.view({ token: token.value });
  if ("error" in view) {
    notFound.value = true;
    table.value = null;
    return;
  }
  table.value = { ...view, startTime: String(view.startTime), endTime: String(view.endTime), cutoffTime: String(view.cutoffTime) } as TableDetails;
}

async function loadMine() {
  if (!table.value || !signedIn.value) return;
  const mine = await client.api.tables.place({ session: session(), gathering: table.value.gathering });
  if ("error" in mine) return;
  hosting.value = mine.hosting;
  place.value = { reservation: mine.place.reservation ?? null, position: mine.place.position ?? null };
  if (hosting.value) await loadLinks();
}

async function loadLinks() {
  if (!table.value) return;
  const listed = await client.api.links.list({ session: session(), gathering: table.value.gathering });
  if (!("error" in listed)) links.value = listed.shared.links as LinkRow[];
}

const ACCEPT_ERRORS: Record<string, string> = {
  CONFLICT: "You can't join right now: you already joined, you're the host, or the table is closed.",
  FORBIDDEN: "This table is only open to people with a matching email domain.",
  NOT_FOUND: "This link no longer works.",
  UNAUTHORIZED: "Your session ended. Sign in again.",
};

async function accept() {
  if (!signedIn.value) {
    // login keeps this path, so the accept finishes when the guest lands back here
    await router.push({ path: "/login", query: { redirect: `/t/${token.value}?accept=1` } });
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  const result = await client.api.tables.accept({ session: session(), token: token.value });
  busy.value = false;
  if ("error" in result) {
    errorMessage.value = ACCEPT_ERRORS[result.error] ?? `Could not accept (${result.error}).`;
    return;
  }
  await Promise.all([loadTable(), loadMine()]);
}

async function withdraw() {
  if (!table.value) return;
  busy.value = true;
  errorMessage.value = "";
  const result = await client.api.tables.withdraw({ session: session(), gathering: table.value.gathering });
  busy.value = false;
  if ("error" in result) {
    errorMessage.value = result.error === "CONFLICT" ? "Seats are locked, so you can no longer withdraw." : `Could not withdraw (${result.error}).`;
    return;
  }
  message.value = "You withdrew. You can accept again while the table is open.";
  await Promise.all([loadTable(), loadMine()]);
}

async function addLink() {
  if (!table.value) return;
  const label = newLabel.value.trim() || null;
  const result = await client.api.links.create({ session: session(), gathering: table.value.gathering, label });
  if ("error" in result) {
    errorMessage.value = `Could not add a link (${result.error}).`;
    return;
  }
  newLabel.value = "";
  await loadLinks();
}

async function revoke(link: string) {
  const result = await client.api.links.revoke({ session: session(), link });
  if ("error" in result) {
    errorMessage.value = `Could not revoke the link (${result.error}).`;
    return;
  }
  await loadLinks();
  // revoking the link this page was opened with makes the page itself stop resolving
  await loadTable();
}

async function copy(t: string) {
  await navigator.clipboard.writeText(shareUrl(t));
  message.value = "Link copied.";
}

async function signOut() {
  await logoutCurrentSession();
  hosting.value = false;
  place.value = null;
  links.value = [];
  message.value = "";
  errorMessage.value = "";
}

onMounted(async () => {
  if (!authState.checked) await refreshAuth();
  await loadTable();
  await loadMine();
  if (route.query.accept === "1") {
    await router.replace({ path: route.path });
    if (table.value && signedIn.value && hosting.value) {
      errorMessage.value = `You signed in as ${authState.user?.email}, the host of this table, so nothing was accepted. Sign out and sign in with the other test account to accept as a guest.`;
    } else if (table.value && signedIn.value && !seated.value && !waitlisted.value) await accept();
  }
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
        <p class="muted">You're hosting this table, so you can't take a seat here. To try it as a guest, open the link in a private window and sign in with the other test account.</p>
        <strong>Share links</strong>
        <ul class="list">
          <li v-for="l in links" :key="l.link">
            <div class="row">
              <span>{{ l.label || "Unnamed link" }}<span v-if="!l.active" class="muted"> (turned off)</span></span>
              <span v-if="l.active" class="actions">
                <button type="button" class="link-btn" @click="copy(l.token)">Copy</button>
                <button type="button" class="link-btn danger" @click="revoke(l.link)">Turn off</button>
              </span>
            </div>
          </li>
        </ul>
        <form class="row" @submit.prevent="addLink">
          <input v-model="newLabel" class="input" placeholder="New link name, e.g. Club chat" />
          <button type="submit" class="btn btn-small">Add</button>
        </form>
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
