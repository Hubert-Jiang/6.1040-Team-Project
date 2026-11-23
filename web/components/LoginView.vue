<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authState, client, sanitizeRedirect, setStoredSession } from "../auth-client.ts";

const route = useRoute();
const router = useRouter();
const busy = ref<"touchstone" | "test" | null>(null);
const errorMessage = ref("");

const returnTo = computed(() => sanitizeRedirect(route.query.redirect));

async function signInWithTouchstone() {
  if (busy.value) return;
  busy.value = "touchstone";
  errorMessage.value = "";
  const result = await client.auth.petrock.start({ returnTo: returnTo.value });
  if ("error" in result) {
    errorMessage.value = "Could not start MIT Touchstone login.";
    busy.value = null;
    return;
  }
  window.location.assign(result.authorizationUrl);
}

async function signInAsTestAccount() {
  if (busy.value) return;
  busy.value = "test";
  errorMessage.value = "";
  const result = await client.auth["test-login"]({ returnTo: returnTo.value });
  if ("error" in result) {
    errorMessage.value = "Could not sign in with the test account.";
    busy.value = null;
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
  await router.replace(result.returnTo);
}
</script>

<template>
  <main class="shell stack">
    <button
      type="button"
      class="btn btn-primary"
      :disabled="busy !== null"
      @click="signInWithTouchstone"
    >
      {{ busy === "touchstone" ? "Redirecting…" : "Sign in with MIT Touchstone" }}
    </button>
    <button
      type="button"
      class="btn"
      :disabled="busy !== null"
      @click="signInAsTestAccount"
    >
      {{ busy === "test" ? "Signing in…" : "Login as Test Account" }}
    </button>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
  </main>
</template>
