<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, logoutCurrentSession } from "../auth-client.ts";

const route = useRoute();
const router = useRouter();
const tableId = computed(() => String(route.params.id ?? ""));

async function signOut() {
  await logoutCurrentSession();
  await router.replace({ path: "/login", query: { redirect: route.fullPath } });
}
</script>

<template>
  <main class="shell card stack">
    <strong>Table: {{ tableId }}</strong>
    <div v-if="authState.user" class="muted">
      <div>{{ authState.user.name ?? authState.user.email }}</div>
      <div>{{ authState.user.email }} ({{ authState.user.affiliation ?? authState.user.domain }})</div>
    </div>
    <button type="button" class="btn" @click="signOut">Sign out</button>
  </main>
</template>
