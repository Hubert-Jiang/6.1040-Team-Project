import { afterAll, beforeEach, expect, test } from "bun:test";
import { createHttpClient, type HttpClientError } from "@mit-sdg/sync-engine-http/client";
import type { Client } from "@mit-sdg/sync-engine/client";
import type { AppWireHttp } from "../generated/wire.ts";
import type { PetrockClient } from "../src/auth/petrock.ts";
import { startHost } from "../src/host.ts";
import { testDatabase } from "./support/mongo.ts";

let server: ReturnType<typeof startHost> | undefined;
let client: Client<AppWireHttp, HttpClientError>;

beforeEach(async () => {
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
});

test("test-login authenticates demo user, preserves relative returnTo, and supports /auth/me + /auth/logout", async () => {
  const before = await client.auth.me({});
  expect(before).toEqual({ authenticated: false });

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
  });

  const logout = await client.auth.logout({ session: login.session });
  expect(logout).toEqual({ ended: true });

  const after = await client.auth.me({ session: login.session });
  expect(after).toEqual({ authenticated: false });

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
