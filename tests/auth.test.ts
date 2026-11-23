import { afterAll, beforeEach, expect, test } from "bun:test";
import { createHttpClient, type HttpClientError } from "@mit-sdg/sync-engine-http/client";
import type { Client } from "@mit-sdg/sync-engine/client";
import type { AppWireHttp } from "../generated/wire.ts";
import { type PetrockClient, exchangePetrockCode, readPetrockConfig } from "../src/auth/petrock.ts";
import { startHost } from "../src/host.ts";
import { testDatabase } from "./support/mongo.ts";

let server: ReturnType<typeof startHost> | undefined;
let client: Client<AppWireHttp, HttpClientError>;
const originalEnableTestLogin = process.env.ENABLE_TEST_LOGIN;
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(async () => {
  process.env.ENABLE_TEST_LOGIN = "true";
  process.env.NODE_ENV = "test";
  server?.stop(true);
  const database = await testDatabase();
  const mockPetrock: PetrockClient = {
    exchangeCode: async (code: string) => {
      if (code === "good-code") {
        return {
          externalId: "ben@mit.edu",
          email: "ben@mit.edu",
          name: "Ben Bitdiddle",
          affiliation: "student",
        };
      }
      throw new Error("rejected code");
    },
  };
  server = startHost({ hostname: "127.0.0.1", port: 0, database, petrock: mockPetrock });
  client = createHttpClient<AppWireHttp>({
    baseUrl: `http://127.0.0.1:${server.port}/`,
  });
});

afterAll(() => {
  server?.stop(true);
  if (originalEnableTestLogin === undefined) delete process.env.ENABLE_TEST_LOGIN;
  else process.env.ENABLE_TEST_LOGIN = originalEnableTestLogin;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("test-login authenticates demo user, preserves relative returnTo, and supports /auth/me + /auth/logout", async () => {
  const before = await client.auth.me({});
  expect(before).toEqual({ authenticated: false, testLoginEnabled: true });

  const login = await client.auth["test-login"]({ returnTo: "/tables/xyz" });
  expect("error" in login).toBe(false);
  if ("error" in login) throw new Error(login.error);
  expect(login.returnTo).toBe("/tables/xyz");
  expect(login.email).toBe("test-student@mit.edu");
  expect(login.domain).toBe("mit.edu");
  expect(login.name).toBe("Test Student");
  expect(login.affiliation).toBe("student");
  expect(login.session.length).toBeGreaterThan(10);

  const me = await client.auth.me({ session: login.session });
  expect(me).toEqual({
    authenticated: true,
    user: login.user,
    email: "test-student@mit.edu",
    domain: "mit.edu",
    name: "Test Student",
    affiliation: "student",
    testLoginEnabled: true,
  });

  const logout = await client.auth.logout({ session: login.session });
  expect(logout).toEqual({ ended: true });

  const after = await client.auth.me({ session: login.session });
  expect(after).toEqual({ authenticated: false, testLoginEnabled: true });

  const repeatLogout = await client.auth.logout({ session: login.session });
  expect(repeatLogout).toEqual({ error: "UNAUTHORIZED" });
});

test("test-login and petrock start sanitize unsafe returnTo values to /", async () => {
  const login = await client.auth["test-login"]({ returnTo: "https://evil.example/phish" });
  expect("error" in login).toBe(false);
  if ("error" in login) throw new Error(login.error);
  expect(login.returnTo).toBe("/");

  const start = await client.auth.petrock.start({ returnTo: "//evil.example" });
  expect("error" in start).toBe(false);
  if ("error" in start) throw new Error(start.error);
  expect(start.authorizationUrl).toContain("touchstone/oidc/authorization");
});

test("petrock OIDC start + callback authenticates MIT user, preserves returnTo, and prevents state replay", async () => {
  const start = await client.auth.petrock.start({ returnTo: "/tables/xyz" });
  expect("error" in start).toBe(false);
  if ("error" in start) throw new Error(start.error);

  const authUrl = new URL(start.authorizationUrl);
  const state = authUrl.searchParams.get("state") ?? "";
  expect(state.length).toBeGreaterThan(10);
  expect(authUrl.searchParams.get("scope")).toBe("openid email profile");

  const callback = await client.auth.petrock.callback({ code: "good-code", state });
  expect("error" in callback).toBe(false);
  if ("error" in callback) throw new Error(callback.error);
  expect(callback.returnTo).toBe("/tables/xyz");
  expect(callback.email).toBe("ben@mit.edu");
  expect(callback.name).toBe("Ben Bitdiddle");
  expect(callback.affiliation).toBe("student");

  const me = await client.auth.me({ session: callback.session });
  expect(me).toEqual({
    authenticated: true,
    user: callback.user,
    email: "ben@mit.edu",
    domain: "mit.edu",
    name: "Ben Bitdiddle",
    affiliation: "student",
    testLoginEnabled: true,
  });

  // Replay of the same state is refused
  const replay = await client.auth.petrock.callback({ code: "good-code", state });
  expect(replay).toEqual({ error: "INVALID_REQUEST" });
});

test("petrock callback with bad code consumes state, refuses UNAUTHORIZED, and creates no session", async () => {
  const start = await client.auth.petrock.start({ returnTo: "/tables/xyz" });
  if ("error" in start) throw new Error(start.error);
  const state = new URL(start.authorizationUrl).searchParams.get("state") ?? "";

  const failed = await client.auth.petrock.callback({ code: "bad-code", state });
  expect(failed).toEqual({ error: "UNAUTHORIZED" });

  // State was consumed so even a valid code cannot reuse it
  const reuse = await client.auth.petrock.callback({ code: "good-code", state });
  expect(reuse).toEqual({ error: "INVALID_REQUEST" });
});

test("host serves built Vue SPA HTML on GET /tables/xyz and /auth/petrock/callback", async () => {
  const res = await fetch(`http://127.0.0.1:${server!.port}/tables/xyz`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('<div id="app"></div>');
});

test("test-login is refused unless ENABLE_TEST_LOGIN=true outside production", async () => {
  delete process.env.ENABLE_TEST_LOGIN;
  expect(await client.auth["test-login"]({})).toEqual({ error: "FORBIDDEN" });

  process.env.ENABLE_TEST_LOGIN = "false";
  expect(await client.auth["test-login"]({})).toEqual({ error: "FORBIDDEN" });

  process.env.ENABLE_TEST_LOGIN = "true";
  process.env.NODE_ENV = "production";
  expect(await client.auth["test-login"]({})).toEqual({ error: "FORBIDDEN" });
  expect(await client.auth.me({})).toEqual({ authenticated: false, testLoginEnabled: false });
});

test("readPetrockConfig trims values and falls back on blank authority or redirectUri", () => {
  expect(
    readPetrockConfig({
      PETROCK_AUTHORITY: " https://petrock.mit.edu/ ",
      PETROCK_CLIENT_ID: " 4d2lKAvZixtV\n",
      PETROCK_CLIENT_SECRET: " secret ",
      PETROCK_REDIRECT_URI: " https://seat.mit-sdg.dev/auth/petrock/callback ",
    }),
  ).toEqual({
    authority: "https://petrock.mit.edu",
    clientId: "4d2lKAvZixtV",
    clientSecret: "secret",
    redirectUri: "https://seat.mit-sdg.dev/auth/petrock/callback",
  });

  expect(
    readPetrockConfig({
      PETROCK_AUTHORITY: "   ",
      PETROCK_REDIRECT_URI: "",
    }),
  ).toEqual({
    authority: "https://petrock.mit.edu",
    clientId: "",
    clientSecret: "",
    redirectUri: "http://127.0.0.1:8080/auth/petrock/callback",
  });
});

test("exchangePetrockCode surfaces OAuth error details from token endpoint failures", async () => {
  const mockFetch = (async () =>
    new Response(JSON.stringify({ error: "invalid_client", error_description: "Bad client secret" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof globalThis.fetch;

  await expect(
    exchangePetrockCode("some-code", {
      config: {
        authority: "https://petrock.mit.edu",
        clientId: "cid",
        clientSecret: "wrong",
        redirectUri: "https://seat.mit-sdg.dev/auth/petrock/callback",
      },
      fetch: mockFetch,
    }),
  ).rejects.toThrow("Petrock token endpoint returned status 401 (invalid_client: Bad client secret)");
});
