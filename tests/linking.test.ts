import { beforeEach, expect, test } from "bun:test";
import { InvalidExpiry, LinkingConcept, NotCreator } from "../src/concepts/Linking.ts";
import { testDatabase } from "./support/mongo.ts";

// a fixed clock: `at(h)` is h hours after noon on Dec 1
const at = (hours: number) => new Date(Date.UTC(2026, 11, 1, 12 + hours));

let links: LinkingConcept;
beforeEach(async () => {
  links = new LinkingConcept(await testDatabase());
});

test("principle: a link resolves to its gathering until it is revoked", async () => {
  const { link, token } = await links.createLink({ target: "dinner", creator: "noah", label: "Next House list", now: at(0) });
  expect(await links._resolve({ token, now: at(1) })).toEqual([{ target: "dinner", link }]);

  await links.revokeLink({ link, creator: "noah" });
  expect(await links._resolve({ token, now: at(1) })).toEqual([]);
});

test("a made-up or empty token resolves to nothing", async () => {
  await links.createLink({ target: "dinner", creator: "noah", now: at(0) });
  expect(await links._resolve({ token: "not-a-real-token", now: at(1) })).toEqual([]);
  expect(await links._resolve({ token: "", now: at(1) })).toEqual([]);
});

test("a link with an expiry resolves before it and not from it on", async () => {
  const { link, token } = await links.createLink({ target: "dinner", creator: "noah", expiresAt: at(4), now: at(0) });
  expect(await links._resolve({ token, now: at(3) })).toEqual([{ target: "dinner", link }]);
  expect(await links._resolve({ token, now: at(4) })).toEqual([]);
  expect(await links._resolve({ token, now: at(5) })).toEqual([]);
});

test("an expiry that is not in the future is refused", async () => {
  await expect(links.createLink({ target: "dinner", creator: "noah", expiresAt: at(0), now: at(0) })).rejects.toBeInstanceOf(InvalidExpiry);
  await expect(links.createLink({ target: "dinner", creator: "noah", expiresAt: at(-1), now: at(0) })).rejects.toBeInstanceOf(InvalidExpiry);
  await expect(links.createLink({ target: "dinner", creator: "noah", expiresAt: new Date(Number.NaN), now: at(0) })).rejects.toBeInstanceOf(InvalidExpiry);
  // nothing was created by the refused calls
  expect(await links._listForTarget({ target: "dinner" })).toEqual([]);
});

test("only the creator can revoke a link, and revoking twice is harmless", async () => {
  const { link, token } = await links.createLink({ target: "dinner", creator: "noah", now: at(0) });
  await expect(links.revokeLink({ link, creator: "alice" })).rejects.toBeInstanceOf(NotCreator);
  await expect(links.revokeLink({ link: "no-such-link", creator: "noah" })).rejects.toBeInstanceOf(NotCreator);
  // the refused revokes left the link working
  expect(await links._resolve({ token, now: at(1) })).toEqual([{ target: "dinner", link }]);

  await links.revokeLink({ link, creator: "noah" });
  await links.revokeLink({ link, creator: "noah" });
  expect(await links._resolve({ token, now: at(1) })).toEqual([]);
});

test("revoking one channel's link leaves the gathering's other links working", async () => {
  const dorm = await links.createLink({ target: "dinner", creator: "noah", label: "Dorm list", now: at(0) });
  const club = await links.createLink({ target: "dinner", creator: "noah", label: "Club chat", now: at(0) });
  await links.revokeLink({ link: dorm.link, creator: "noah" });
  expect(await links._resolve({ token: dorm.token, now: at(1) })).toEqual([]);
  expect(await links._resolve({ token: club.token, now: at(1) })).toEqual([{ target: "dinner", link: club.link }]);
});

test("revokeAllForTarget turns off every link to that gathering and no others", async () => {
  const first = await links.createLink({ target: "dinner", creator: "noah", now: at(0) });
  const second = await links.createLink({ target: "dinner", creator: "noah", now: at(0) });
  const other = await links.createLink({ target: "lunch", creator: "alice", now: at(0) });
  await links.revokeAllForTarget({ target: "dinner" });
  expect(await links._resolve({ token: first.token, now: at(1) })).toEqual([]);
  expect(await links._resolve({ token: second.token, now: at(1) })).toEqual([]);
  expect(await links._resolve({ token: other.token, now: at(1) })).toEqual([{ target: "lunch", link: other.link }]);
  // a gathering with no links is fine too
  await links.revokeAllForTarget({ target: "nothing" });
});

test("tokens are long, URL-safe, and never repeat", async () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const { token } = await links.createLink({ target: "dinner", creator: "noah", now: at(0) });
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    tokens.add(token);
  }
  expect(tokens.size).toBe(100);
});

test("a host's links are listed active first, then oldest first, with empty labels left off", async () => {
  const dorm = await links.createLink({ target: "dinner", creator: "noah", label: " Dorm list ", now: at(0) });
  const club = await links.createLink({ target: "dinner", creator: "noah", label: "", expiresAt: at(9), now: at(1) });
  const slack = await links.createLink({ target: "dinner", creator: "noah", label: "Slack", now: at(2) });
  await links.createLink({ target: "lunch", creator: "alice", now: at(0) });
  await links.revokeLink({ link: dorm.link, creator: "noah" });

  expect(await links._listForTarget({ target: "dinner" })).toEqual([
    { link: club.link, token: club.token, label: undefined, active: true, expiresAt: at(9) },
    { link: slack.link, token: slack.token, label: "Slack", active: true, expiresAt: undefined },
    { link: dorm.link, token: dorm.token, label: "Dorm list", active: false, expiresAt: undefined },
  ]);
  expect(await links._listForTarget({ target: "nothing" })).toEqual([]);
});
