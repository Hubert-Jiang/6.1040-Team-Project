import { beforeEach, expect, test } from "bun:test";
import type { PetrockClient } from "../src/auth/petrock.ts";
import {
  AuthenticatingConcept,
  EmailConflict,
  InvalidIdentity,
  InvalidReturnTo,
  InvalidState,
  OidcExchangeFailed,
} from "../src/concepts/Authenticating.ts";
import { testDatabase } from "./support/mongo.ts";

const at = (minutes: number) => new Date(Date.UTC(2026, 11, 1, 12, minutes));

let auth: AuthenticatingConcept;
let mockPetrock: PetrockClient;

beforeEach(async () => {
  mockPetrock = {
    exchangeCode: async (code: string) => {
      if (code === "valid-code") {
        return {
          externalId: "ben@mit.edu",
          email: "ben@mit.edu",
          name: "Ben Bitdiddle",
          affiliation: "student",
        };
      }
      throw new Error("bad code");
    },
  };
  auth = new AuthenticatingConcept(await testDatabase(), "Authenticating", mockPetrock);
});

test("authenticate creates and updates a user by externalId and answers queries", async () => {
  const first = await auth.authenticate({
    externalId: "alyssa@mit.edu",
    email: "Alyssa@MIT.EDU",
    name: "Alyssa P. Hacker",
    affiliation: "student",
  });
  expect(await auth._getUser({ user: first.user })).toEqual([
    {
      externalId: "alyssa@mit.edu",
      email: "alyssa@mit.edu",
      domain: "mit.edu",
      name: "Alyssa P. Hacker",
      affiliation: "student",
    },
  ]);
  expect(await auth._hasDomain({ user: first.user, domain: "MIT.EDU" })).toEqual({ matches: true });
  expect(await auth._hasDomain({ user: first.user, domain: "harvard.edu" })).toEqual({ matches: false });

  const second = await auth.authenticate({
    externalId: "alyssa@mit.edu",
    email: "alyssa@csail.mit.edu",
    name: "Alyssa Hacker",
  });
  expect(second.user).toBe(first.user);
  expect(await auth._getUser({ user: first.user })).toEqual([
    {
      externalId: "alyssa@mit.edu",
      email: "alyssa@csail.mit.edu",
      domain: "csail.mit.edu",
      name: "Alyssa Hacker",
    },
  ]);
});

test("authenticate refuses invalid identity and email conflicts across externalIds", async () => {
  await expect(auth.authenticate({ externalId: "", email: "ben@mit.edu" })).rejects.toBeInstanceOf(InvalidIdentity);
  await expect(auth.authenticate({ externalId: "ben", email: "not-an-email" })).rejects.toBeInstanceOf(InvalidIdentity);

  await auth.authenticate({ externalId: "ext-1", email: "shared@mit.edu" });
  await expect(auth.authenticate({ externalId: "ext-2", email: "shared@mit.edu" })).rejects.toBeInstanceOf(EmailConflict);
});

test("OIDC state lifecycle is single-use, validates relative returnTo, and expires cleanly", async () => {
  await expect(auth.beginOidc({ returnTo: "https://evil.example", now: at(0) })).rejects.toBeInstanceOf(InvalidReturnTo);
  await expect(auth.beginOidc({ returnTo: "//evil.example", now: at(0) })).rejects.toBeInstanceOf(InvalidReturnTo);

  const { state } = await auth.beginOidc({ returnTo: "/tables/xyz", now: at(0) });
  expect(await auth.consumeOidc({ state, now: at(5) })).toEqual({ returnTo: "/tables/xyz" });
  // Replay must fail
  await expect(auth.consumeOidc({ state, now: at(5) })).rejects.toBeInstanceOf(InvalidState);

  const expired = await auth.beginOidc({ returnTo: "/tables/abc", now: at(0) });
  await expect(auth.consumeOidc({ state: expired.state, now: at(10) })).rejects.toBeInstanceOf(InvalidState);
});

test("concurrent consumeOidc allows only one winner", async () => {
  const { state } = await auth.beginOidc({ returnTo: "/tables/xyz", now: at(0) });
  const results = await Promise.allSettled([
    auth.consumeOidc({ state, now: at(1) }),
    auth.consumeOidc({ state, now: at(1) }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});

test("verifyOidcCode verifies code via Petrock client and refuses failures", async () => {
  expect(await auth.verifyOidcCode({ code: "valid-code" })).toEqual({
    externalId: "ben@mit.edu",
    email: "ben@mit.edu",
    name: "Ben Bitdiddle",
    affiliation: "student",
  });
  await expect(auth.verifyOidcCode({ code: "" })).rejects.toBeInstanceOf(OidcExchangeFailed);
  await expect(auth.verifyOidcCode({ code: "bad" })).rejects.toBeInstanceOf(OidcExchangeFailed);
});
