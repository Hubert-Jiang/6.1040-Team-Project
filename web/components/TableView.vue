<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { openTableUrl } from "../../src/venues/opentable.ts";
import { client, getStoredSession, logoutCurrentSession } from "../auth-client.ts";

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

const shown = (time: string) => new Date(time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// the party is the guests with a spot plus the host
const bookingUrl = computed(() =>
  table.value?.confirmedVenue
    ? openTableUrl({ venue: table.value.confirmedVenue, partySize: table.value.reservedCount + 1, time: new Date(table.value.startTime) })
    : "",
);

async function load() {
  const result = await client.gatherings.view({ session: getStoredSession() ?? "", gathering: tableId.value });
  table.value = "error" in result ? null : result;
  loaded.value = true;
}
onMounted(load);

async function act(action: "confirm" | "book" | "cancel") {
  const result = await client.gatherings[action]({ session: getStoredSession() ?? "", gathering: tableId.value });
  errorMessage.value = "error" in result ? "That did not go through. The table may have passed its cutoff or changed since this page loaded." : "";
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
    <section v-else-if="loaded" class="card stack">
      <strong>No such table</strong>
      <p class="muted">This table does not exist, or you are not its host. Guests will be able to open a table from its invitation link.</p>
    </section>

    <RouterLink class="btn" to="/">My tables</RouterLink>
    <button type="button" class="btn" @click="signOut">Sign out</button>
  </main>
</template>
