<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, setStoredSession } from "../auth-client.ts";

const route = useRoute();
const router = useRouter();
const errorMessage = ref("");

onMounted(async () => {
  const providerError = typeof route.query.error === "string" ? route.query.error : "";
  const code = typeof route.query.code === "string" ? route.query.code : "";
  const state = typeof route.query.state === "string" ? route.query.state : "";

  if (providerError || !code || !state) {
    errorMessage.value = providerError
      ? `MIT Touchstone returned an error: ${providerError}`
      : "Missing authorization code or state.";
    return;
  }

  const result = await client.auth.petrock.callback({ code, state });
  if ("error" in result) {
    errorMessage.value =
      result.error === "INVALID_REQUEST"
        ? "Login session expired or already used. Please sign in again."
        : "MIT Touchstone verification failed. Please try again.";
    return;
  }

  setStoredSession(result.session);
  authState.checked = true;
  authState.user = {
    user: result.user,
    email: result.email,
    domain: result.domain,
    name: result.name,
    affiliation: result.affiliation,
  };
  await router.replace(result.returnTo || "/");
});
</script>

<template>
  <main class="shell card stack">
    <p v-if="!errorMessage" class="muted">Completing MIT Touchstone sign-in…</p>
    <template v-else>
      <p class="error">{{ errorMessage }}</p>
      <RouterLink class="btn" to="/login">Back to sign in</RouterLink>
    </template>
  </main>
</template>
