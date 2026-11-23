import { createHttpClient, type HttpClientError } from "@mit-sdg/sync-engine-http/client";
import type { Client } from "@mit-sdg/sync-engine/client";
import { reactive } from "vue";
import type { AppWireHttp } from "../generated/wire.ts";

const SESSION_KEY = "auth_demo_session";

export interface AuthUser {
  user: string;
  email: string;
  domain: string;
  name?: string;
  affiliation?: string;
}

export const client: Client<AppWireHttp, HttpClientError> = createHttpClient<AppWireHttp>({
  baseUrl: "/",
});

export const authState = reactive<{
  checked: boolean;
  user: AuthUser | null;
  testLoginEnabled: boolean;
}>({
  checked: false,
  user: null,
  testLoginEnabled: false,
});

export function getStoredSession(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredSession(session: string | null): void {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, session);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function sanitizeRedirect(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return "/";
  return trimmed;
}

export async function refreshAuth(): Promise<AuthUser | null> {
  const session = getStoredSession();
  const result = await client.auth.me(session ? { session } : {});
  authState.checked = true;
  if ("error" in result) {
    authState.user = null;
    authState.testLoginEnabled = false;
    if (session) setStoredSession(null);
    return null;
  }
  authState.testLoginEnabled = result.testLoginEnabled;
  if (!result.authenticated) {
    authState.user = null;
    if (session) setStoredSession(null);
    return null;
  }
  authState.user = {
    user: result.user,
    email: result.email,
    domain: result.domain,
    name: result.name,
    affiliation: result.affiliation,
  };
  return authState.user;
}

export async function logoutCurrentSession(): Promise<void> {
  const session = getStoredSession();
  if (session) {
    await client.auth.logout({ session });
  }
  setStoredSession(null);
  authState.user = null;
  authState.checked = true;
}
