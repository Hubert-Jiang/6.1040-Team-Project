<script setup lang="ts">
import { useRouter } from "vue-router";
import { authState, logoutCurrentSession } from "../auth-client.ts";

const router = useRouter();

async function signOut() {
  await logoutCurrentSession();
  await router.replace("/login");
}
</script>

<template>
  <main class="shell card stack">
    <strong>Signed in</strong>
    <div v-if="authState.user" class="muted">
      <div>{{ authState.user.name ?? authState.user.email }}</div>
      <div>{{ authState.user.email }}</div>
    </div>
    <RouterLink class="btn btn-primary" to="/tables/xyz">Open /tables/xyz</RouterLink>
    <button type="button" class="btn" @click="signOut">Sign out</button>
  </main>
</template>
