<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { authState, client, getStoredSession, logoutCurrentSession } from "../auth-client.ts";

interface HostedRow {
  gathering: string;
  title: string;
  status: string;
  startTime: string;
  token: string | null;
}

const router = useRouter();
const tables = ref<HostedRow[]>([]);
const loading = ref(true);
const errorMessage = ref("");

async function load() {
  const session = getStoredSession() ?? "";
  const mine = await client.api.tables.mine({ session });
  if ("error" in mine) {
    errorMessage.value = "Could not load your tables.";
    loading.value = false;
    return;
  }
  // the table page is reached through a link, so each row opens the table's first active link
  tables.value = await Promise.all(
    mine.hosted.tables.map(async (t) => {
      const links = await client.api.links.list({ session, gathering: t.gathering });
      const active = "error" in links ? undefined : links.shared.links.find((l) => l.active);
      return { gathering: t.gathering, title: t.title, status: t.status, startTime: String(t.startTime), token: active?.token ?? null };
    }),
  );
  loading.value = false;
}

async function signOut() {
  await logoutCurrentSession();
  await router.replace("/login");
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

onMounted(load);
</script>

<template>
  <main class="shell card stack">
    <div class="row">
      <strong>Seat at the table</strong>
      <span v-if="authState.user" class="muted">{{ authState.user.name ?? authState.user.email }}</span>
    </div>
    <RouterLink class="btn btn-primary" to="/new">Host a new table</RouterLink>

    <strong>Your tables</strong>
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-else-if="tables.length === 0" class="muted">You aren't hosting any tables yet.</p>
    <ul v-else class="list">
      <li v-for="t in tables" :key="t.gathering">
        <RouterLink v-if="t.token" :to="`/t/${t.token}`">{{ t.title }}</RouterLink>
        <span v-else>{{ t.title }} <span class="muted">(no active link)</span></span>
        <div class="muted">{{ when(t.startTime) }} · {{ t.status.toLowerCase() }}</div>
      </li>
    </ul>

    <button type="button" class="btn" @click="signOut">Sign out</button>
  </main>
</template>
