<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { openTableUrl } from "../../src/venues/opentable.ts";
import { authState, client, getStoredSession, logoutCurrentSession, setStoredSession } from "../auth-client.ts";
import { createLiveRefresher } from "../live-refresh.ts";

interface Table {
  title: string;
  status: string;
  area: string;
  startTime: string;
  endTime: string;
  cutoffTime: string;
  details?: string;
  confirmedVenue?: string;
  capacity: number;
  reservedCount: number;
  waitlistCount: number;
  locked: boolean;
}

const route = useRoute();
const router = useRouter();
const tableId = computed(() => String(route.params.id ?? ""));
const table = ref<Table | null>(null);
const loaded = ref(false);
const actionInFlight = ref(false);
const errorMessage = ref("");
let loadGeneration = 0;

interface LinkRow {
  link: string;
  token: string;
  label?: string | null;
  active: boolean;
}
const links = ref<LinkRow[]>([]);
const newLabel = ref("");
const copied = ref("");
const togglingLink = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
const shareUrl = (token: string) => `${window.location.origin}/invite/${token}`;

function clearCopied() {
  if (copiedTimer !== null) {
    clearTimeout(copiedTimer);
    copiedTimer = null;
  }
  copied.value = "";
}

// guests reach a table only through a share link, so the host makes one per group chat and can toggle any off or on
async function loadLinks(generation = loadGeneration) {
  const currentId = tableId.value;
  const listed = await client.api.links.list({ session: getStoredSession() ?? "", gathering: currentId });
  if (generation !== loadGeneration || tableId.value !== currentId) return;
  if ("error" in listed) {
    if (listed.error === "UNAUTHORIZED") {
      await handleUnauthorized();
      return;
    }
    links.value = [];
    return;
  }
  links.value = listed.shared.links as LinkRow[];
}

async function addLink() {
  if (actionInFlight.value) return;
  actionInFlight.value = true;
  try {
    const result = await client.api.links.create({ session: getStoredSession() ?? "", gathering: tableId.value, label: newLabel.value.trim() || null });
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        await handleUnauthorized();
        return;
      }
      errorMessage.value = "Could not make a link.";
      return;
    }
    errorMessage.value = "";
    newLabel.value = "";
    await loadLinks();
  } finally {
    actionInFlight.value = false;
  }
}

async function toggleLink(link: LinkRow) {
  if (togglingLink.value || actionInFlight.value) return;
  togglingLink.value = link.link;
  actionInFlight.value = true;
  try {
    const session = getStoredSession() ?? "";
    const result = link.active
      ? await client.api.links.revoke({ session, link: link.link })
      : await client.api.links.activate({ session, link: link.link });
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        await handleUnauthorized();
        return;
      }
      errorMessage.value = link.active ? "Could not turn off that link." : "Could not turn on that link.";
    } else {
      errorMessage.value = "";
      if (link.active && copied.value === link.token) {
        clearCopied();
      }
    }
    await loadLinks();
  } finally {
    togglingLink.value = null;
    actionInFlight.value = false;
  }
}

async function copy(token: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(token));
  } catch {
    errorMessage.value = "Could not copy that link.";
    return;
  }
  clearCopied();
  copied.value = token;
  copiedTimer = setTimeout(() => {
    if (copied.value === token) {
      copied.value = "";
    }
    copiedTimer = null;
  }, 2000);
}

const shown = (time: string) => new Date(time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// the party is the guests with a spot plus the host
const bookingUrl = computed(() =>
  table.value?.confirmedVenue
    ? openTableUrl({ venue: table.value.confirmedVenue, partySize: table.value.reservedCount + 1, time: new Date(table.value.startTime) })
    : "",
);

async function handleUnauthorized() {
  refresher.stop();
  setStoredSession(null);
  authState.user = null;
  authState.checked = true;
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}

async function load(options: { background?: boolean } = {}) {
  const currentId = tableId.value;
  const generation = loadGeneration;
  const result = await client.gatherings.view({ session: getStoredSession() ?? "", gathering: currentId });
  if (generation !== loadGeneration || tableId.value !== currentId) return;
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") {
      await handleUnauthorized();
      return;
    }
    if (!options.background || result.error === "NOT_FOUND") {
      table.value = null;
    }
  } else {
    table.value = result;
  }
  loaded.value = true;
}

const refresher = createLiveRefresher({
  refresh: () => load({ background: true }),
  isPaused: () => !table.value || actionInFlight.value,
});

async function initForTable() {
  loadGeneration += 1;
  const generation = loadGeneration;
  const currentId = tableId.value;
  table.value = null;
  loaded.value = false;
  errorMessage.value = "";
  links.value = [];
  clearCopied();
  await load();
  if (generation === loadGeneration && tableId.value === currentId && table.value) {
    await loadLinks(generation);
  }
}

onMounted(async () => {
  await initForTable();
  refresher.start();
});

watch(tableId, async (next, prev) => {
  if (next === prev || !next) return;
  refresher.stop();
  await initForTable();
  refresher.start();
});

onUnmounted(() => {
  refresher.stop();
  clearCopied();
});

async function act(action: "confirm" | "book" | "cancel") {
  actionInFlight.value = true;
  try {
    const result = await client.gatherings[action]({ session: getStoredSession() ?? "", gathering: tableId.value });
    if ("error" in result) {
      if (result.error === "UNAUTHORIZED") {
        await handleUnauthorized();
        return;
      }
      errorMessage.value = "That did not go through. The table may have passed its cutoff or changed since this page loaded.";
    } else {
      errorMessage.value = "";
    }
    await load();
  } finally {
    actionInFlight.value = false;
  }
}

async function signOut() {
  refresher.stop();
  await logoutCurrentSession();
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}
</script>

<template>
  <main class="shell stack">
    <section v-if="table" class="card stack">
      <RouterLink to="/" class="muted">← Your tables</RouterLink>
      <div>
        <div class="row">
          <strong class="title">{{ table.title }}</strong>
          <span class="muted">{{ table.status }}</span>
        </div>
        <div class="muted">{{ table.area }}<template v-if="table.confirmedVenue"> · {{ table.confirmedVenue }}</template></div>
      </div>
      <div class="muted">
        <div>Event from {{ shown(table.startTime) }} to {{ shown(table.endTime) }}</div>
        <div>RSVPs close {{ shown(table.cutoffTime) }}</div>
      </div>
      <p v-if="table.details">{{ table.details }}</p>
      <div class="seats">
        <strong>{{ table.reservedCount }} of {{ table.capacity }} guest spots taken</strong><span v-if="table.waitlistCount" class="muted"> · {{ table.waitlistCount }} waiting</span><span v-if="table.locked" class="muted"> · Locked</span>
      </div>

      <button v-if="table.status === 'OPEN'" type="button" class="btn btn-primary" @click="act('confirm')">Confirm table</button>
      <a v-if="bookingUrl && table.status === 'CONFIRMED'" class="btn" :href="bookingUrl" target="_blank" rel="noopener">
        Find {{ table.confirmedVenue }} on OpenTable for {{ table.reservedCount + 1 }}
      </a>
      <button v-if="table.status === 'CONFIRMED' && table.confirmedVenue" type="button" class="btn btn-primary" @click="act('book')">
        Mark as booked
      </button>
      <button v-if="['OPEN', 'CONFIRMED', 'BOOKED'].includes(table.status)" type="button" class="btn" @click="act('cancel')">Cancel table</button>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    </section>

    <section v-if="table" class="card stack">
      <strong>Share links</strong>
      <p v-if="links.length === 0" class="muted">Guests join through a link. Make one for each group chat you post in.</p>
      <ul v-else class="list">
        <li v-for="l in links" :key="l.link">
          <div class="share-row">
            <RouterLink v-if="l.active" class="share-link-label share-link-open" :to="`/invite/${l.token}`">
              {{ l.label || "Unnamed link" }}
            </RouterLink>
            <span v-else class="share-link-label share-link-inactive">{{ l.label || "Unnamed link" }}</span>
            <span class="actions">
              <button
                v-if="l.active"
                type="button"
                :class="['copy-btn', { copied: copied === l.token }]"
                @click="copy(l.token)"
              >
                <svg v-if="copied === l.token" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
                <svg v-else width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                  <path d="M3.5 10.5H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5h6A1.5 1.5 0 0 1 10.5 3v.5" />
                </svg>
                <span>{{ copied === l.token ? "Copied" : "Copy" }}</span>
              </button>
              <button
                type="button"
                role="switch"
                :aria-checked="l.active"
                :aria-label="`${l.active ? 'Turn off' : 'Turn on'} ${l.label || 'Unnamed link'}`"
                :class="['toggle-switch', { on: l.active }]"
                :disabled="actionInFlight || togglingLink === l.link"
                @click="toggleLink(l)"
              >
                <span class="toggle-knob" aria-hidden="true" />
              </button>
            </span>
          </div>
        </li>
      </ul>
      <form class="row" @submit.prevent="addLink">
        <input v-model="newLabel" class="input" placeholder="Link name, e.g. Dorm group chat" />
        <button type="submit" class="btn btn-small">Make link</button>
      </form>
    </section>
    <section v-else-if="loaded" class="card stack">
      <RouterLink to="/" class="muted">← Your tables</RouterLink>
      <strong>No such table</strong>
      <p class="muted">This table does not exist, or you are not its host. Guests open a table from its share link.</p>
    </section>

    <p v-if="authState.user" class="muted small">
      Signed in as {{ authState.user.email }} ·
      <button type="button" class="link-btn" @click="signOut">Sign out</button>
    </p>
  </main>
</template>
