<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { openTableUrl } from "../../src/venues/opentable.ts";
import { authState, client, getStoredSession, logoutCurrentSession, setStoredSession } from "../auth-client.ts";

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
const errorMessage = ref("");

interface LinkRow {
  link: string;
  token: string;
  label?: string | null;
  active: boolean;
}
const links = ref<LinkRow[]>([]);
const newLabel = ref("");
const copied = ref("");
const shareUrl = (token: string) => `${window.location.origin}/t/${token}`;

// guests reach a table only through a share link, so the host makes one per group chat and can turn any off
async function loadLinks() {
  const listed = await client.api.links.list({ session: getStoredSession() ?? "", gathering: tableId.value });
  links.value = "error" in listed ? [] : (listed.shared.links as LinkRow[]);
}

async function addLink() {
  const result = await client.api.links.create({ session: getStoredSession() ?? "", gathering: tableId.value, label: newLabel.value.trim() || null });
  if ("error" in result) {
    errorMessage.value = "Could not make a link.";
    return;
  }
  newLabel.value = "";
  await loadLinks();
}

async function revoke(link: string) {
  const result = await client.api.links.revoke({ session: getStoredSession() ?? "", link });
  if ("error" in result) errorMessage.value = "Could not turn off that link.";
  await loadLinks();
}

async function copy(token: string) {
  await navigator.clipboard.writeText(shareUrl(token));
  copied.value = token;
}

const shown = (time: string) => new Date(time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// the party is the guests with a spot plus the host
const bookingUrl = computed(() =>
  table.value?.confirmedVenue
    ? openTableUrl({ venue: table.value.confirmedVenue, partySize: table.value.reservedCount + 1, time: new Date(table.value.startTime) })
    : "",
);

async function handleUnauthorized() {
  setStoredSession(null);
  authState.user = null;
  authState.checked = true;
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}

async function load() {
  const result = await client.gatherings.view({ session: getStoredSession() ?? "", gathering: tableId.value });
  if ("error" in result) {
    if (result.error === "UNAUTHORIZED") {
      await handleUnauthorized();
      return;
    }
    table.value = null;
  } else {
    table.value = result;
  }
  loaded.value = true;
}
onMounted(async () => {
  await load();
  if (table.value) await loadLinks();
});

async function act(action: "confirm" | "book" | "cancel") {
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
}

async function signOut() {
  await logoutCurrentSession();
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}
</script>

<template>
  <main class="shell stack">
    <section v-if="table" class="card stack">
      <strong>{{ table.title }}</strong>
      <div class="muted">
        <div>{{ table.status }}</div>
        <div>Event from {{ shown(table.startTime) }} to {{ shown(table.endTime) }}</div>
        <div>RSVPs close {{ shown(table.cutoffTime) }}</div>
        <div>{{ table.confirmedVenue ? `${table.confirmedVenue}, ${table.area}` : table.area }}</div>
        <div v-if="table.details">{{ table.details }}</div>
      </div>
      <div>
        {{ table.reservedCount }} of {{ table.capacity }} guest spots taken<span v-if="table.waitlistCount">, {{ table.waitlistCount }} waiting</span><span v-if="table.locked">, locked</span>
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
          <div class="row">
            <span>{{ l.label || "Unnamed link" }}<span v-if="!l.active" class="muted"> (turned off)</span></span>
            <span v-if="l.active" class="actions">
              <RouterLink class="link-btn" :to="`/t/${l.token}`">Open</RouterLink>
              <button type="button" class="link-btn" @click="copy(l.token)">{{ copied === l.token ? "Copied" : "Copy" }}</button>
              <button type="button" class="link-btn danger" @click="revoke(l.link)">Turn off</button>
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
      <strong>No such table</strong>
      <p class="muted">This table does not exist, or you are not its host. Guests open a table from its share link.</p>
    </section>

    <RouterLink class="btn" to="/">My tables</RouterLink>
    <button type="button" class="btn" @click="signOut">Sign out</button>
  </main>
</template>
