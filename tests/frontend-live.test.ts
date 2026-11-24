import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpClient, type HttpClientError } from "@mit-sdg/sync-engine-http/client";
import type { Client } from "@mit-sdg/sync-engine/client";
import type { Db } from "mongodb";
import type { AppWireHttp } from "../generated/wire.ts";
import { AuthenticatingConcept } from "../src/concepts/Authenticating.ts";
import { SessioningConcept } from "../src/concepts/Sessioning.ts";
import { startHost } from "../src/host.ts";
import { createLiveRefresher, type EventListenerTarget, type VisibilityDocumentTarget } from "../web/live-refresh.ts";
import { testDatabase } from "./support/mongo.ts";

function createTestHarness() {
  const focusListeners = new Set<() => void>();
  const pageHideListeners = new Set<() => void>();
  const visibilityListeners = new Set<() => void>();
  let visibilityState = "visible";

  const windowTarget: EventListenerTarget<"focus" | "pagehide"> = {
    addEventListener(type, listener) {
      if (type === "focus") focusListeners.add(listener);
      if (type === "pagehide") pageHideListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "focus") focusListeners.delete(listener);
      if (type === "pagehide") pageHideListeners.delete(listener);
    },
  };

  const documentTarget: VisibilityDocumentTarget = {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(type, listener) {
      if (type === "visibilitychange") visibilityListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "visibilitychange") visibilityListeners.delete(listener);
    },
  };

  let nextTimerId = 1;
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  let clearedCount = 0;

  const setIntervalFn = (fn: () => void, ms: number) => {
    const id = nextTimerId++;
    intervals.set(id, { fn, ms });
    return id as unknown as ReturnType<typeof setInterval>;
  };

  const clearIntervalFn = (id: ReturnType<typeof setInterval>) => {
    if (intervals.delete(id as unknown as number)) {
      clearedCount += 1;
    }
  };

  return {
    windowTarget,
    documentTarget,
    setIntervalFn,
    clearIntervalFn,
    get focusListenerCount() {
      return focusListeners.size;
    },
    get pageHideListenerCount() {
      return pageHideListeners.size;
    },
    get visibilityListenerCount() {
      return visibilityListeners.size;
    },
    get activeIntervalCount() {
      return intervals.size;
    },
    get clearedCount() {
      return clearedCount;
    },
    get registeredIntervalMs() {
      return Array.from(intervals.values()).map((entry) => entry.ms);
    },
    tick() {
      for (const entry of intervals.values()) {
        entry.fn();
      }
    },
    emitFocus() {
      for (const listener of focusListeners) {
        listener();
      }
    },
    emitPageHide() {
      for (const listener of Array.from(pageHideListeners)) {
        listener();
      }
    },
    setVisibility(next: "visible" | "hidden") {
      visibilityState = next;
      for (const listener of visibilityListeners) {
        listener();
      }
    },
  };
}

describe("createLiveRefresher", () => {
  test("polls at 2500 ms by default and invokes refresh on each tick", async () => {
    const harness = createTestHarness();
    let calls = 0;
    const refresher = createLiveRefresher({
      refresh: () => {
        calls += 1;
      },
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();
    expect(harness.registeredIntervalMs).toEqual([2500]);
    expect(calls).toBe(0);

    harness.tick();
    await Promise.resolve();
    expect(calls).toBe(1);

    harness.tick();
    await Promise.resolve();
    expect(calls).toBe(2);

    refresher.stop();
  });

  test("triggers immediate refresh on window focus and when tab becomes visible", async () => {
    const harness = createTestHarness();
    let calls = 0;
    const refresher = createLiveRefresher({
      refresh: () => {
        calls += 1;
      },
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();
    harness.emitFocus();
    await Promise.resolve();
    expect(calls).toBe(1);

    // Transitioning to hidden must not refresh; transitioning back to visible must refresh immediately.
    harness.setVisibility("hidden");
    await Promise.resolve();
    expect(calls).toBe(1);

    harness.setVisibility("visible");
    await Promise.resolve();
    expect(calls).toBe(2);

    refresher.stop();
  });

  test("pauses while hidden or while isPaused() returns true", async () => {
    const harness = createTestHarness();
    let paused = false;
    let calls = 0;
    const refresher = createLiveRefresher({
      refresh: () => {
        calls += 1;
      },
      isPaused: () => paused,
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();

    harness.setVisibility("hidden");
    harness.tick();
    harness.emitFocus();
    await Promise.resolve();
    expect(calls).toBe(0);

    harness.setVisibility("visible");
    await Promise.resolve();
    expect(calls).toBe(1);

    paused = true;
    harness.tick();
    harness.emitFocus();
    await refresher.trigger();
    expect(calls).toBe(1);

    paused = false;
    harness.tick();
    await Promise.resolve();
    expect(calls).toBe(2);

    refresher.stop();
  });

  test("enforces single-flight non-overlapping execution", async () => {
    const harness = createTestHarness();
    let calls = 0;
    let release!: () => void;
    const refresher = createLiveRefresher({
      refresh: () => {
        calls += 1;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();
    const first = refresher.trigger();
    harness.tick();
    harness.emitFocus();
    const overlapping = refresher.trigger();
    expect(calls).toBe(1);

    release();
    await Promise.all([first, overlapping]);

    harness.tick();
    await Promise.resolve();
    expect(calls).toBe(2);
    release();
    await Promise.resolve();

    refresher.stop();
  });

  test("catches refresh errors so subsequent ticks and events keep running", async () => {
    const harness = createTestHarness();
    let calls = 0;
    const refresher = createLiveRefresher({
      refresh: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("transient network failure");
        }
      },
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();
    await refresher.trigger();
    expect(calls).toBe(1);

    harness.tick();
    await Promise.resolve();
    expect(calls).toBe(2);

    refresher.stop();
  });

  test("stop() clears intervals, detaches listeners, and ignores further triggers", async () => {
    const harness = createTestHarness();
    let calls = 0;
    const refresher = createLiveRefresher({
      refresh: () => {
        calls += 1;
      },
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();
    expect(harness.activeIntervalCount).toBe(1);
    expect(harness.focusListenerCount).toBe(1);
    expect(harness.pageHideListenerCount).toBe(1);
    expect(harness.visibilityListenerCount).toBe(1);

    refresher.stop();
    refresher.stop();
    expect(harness.activeIntervalCount).toBe(0);
    expect(harness.clearedCount).toBe(1);
    expect(harness.focusListenerCount).toBe(0);
    expect(harness.pageHideListenerCount).toBe(0);
    expect(harness.visibilityListenerCount).toBe(0);

    harness.tick();
    harness.emitFocus();
    await refresher.trigger();
    expect(calls).toBe(0);
  });

  test("pagehide stops createLiveRefresher and detaches all listeners", async () => {
    const harness = createTestHarness();
    let calls = 0;
    const refresher = createLiveRefresher({
      refresh: () => {
        calls += 1;
      },
      windowTarget: harness.windowTarget,
      documentTarget: harness.documentTarget,
      setIntervalFn: harness.setIntervalFn,
      clearIntervalFn: harness.clearIntervalFn,
    });

    refresher.start();
    expect(harness.activeIntervalCount).toBe(1);
    expect(harness.focusListenerCount).toBe(1);
    expect(harness.pageHideListenerCount).toBe(1);
    expect(harness.visibilityListenerCount).toBe(1);

    harness.emitPageHide();
    expect(harness.activeIntervalCount).toBe(0);
    expect(harness.clearedCount).toBe(1);
    expect(harness.focusListenerCount).toBe(0);
    expect(harness.pageHideListenerCount).toBe(0);
    expect(harness.visibilityListenerCount).toBe(0);

    harness.tick();
    harness.emitFocus();
    harness.setVisibility("visible");
    await refresher.trigger();
    expect(calls).toBe(0);
  });
});

describe("live occupancy HTTP readback", () => {
  let server: ReturnType<typeof startHost> | undefined;
  let client: Client<AppWireHttp, HttpClientError>;
  let database: Db;

  beforeEach(async () => {
    process.env.ENABLE_TEST_LOGIN = "true";
    process.env.NODE_ENV = "test";
    server?.stop(true);
    database = await testDatabase();
    server = startHost({ hostname: "127.0.0.1", port: 0, database });
    client = createHttpClient<AppWireHttp>({ baseUrl: `http://127.0.0.1:${server.port}/` });
  }, 30_000);

  afterAll(() => {
    server?.stop(true);
  });

  async function signIn(email: string) {
    const { user } = await new AuthenticatingConcept(database).authenticate({ externalId: email, email });
    const { session } = await new SessioningConcept(database).start({ subject: user, lifetime: 60 * 60_000, now: new Date() });
    return { user, session };
  }

  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60_000).toISOString();

  async function createTable(session: string, capacity: number) {
    const created = await client.api.tables.create({
      session,
      title: "Live Occupancy Dinner",
      area: "Kendall Square",
      cutoffTime: hoursFromNow(24),
      startTime: hoursFromNow(48),
      endTime: hoursFromNow(50),
      capacity,
    });
    if ("error" in created) throw new Error(`create refused: ${created.error}`);
    return created;
  }

  test("accept, waitlist, withdraw, and waitlist promotion update tables.view, tables.place, and gatherings.view immediately", async () => {
    const host = await signIn("host@mit.edu");
    const guestA = await signIn("guesta@mit.edu");
    const guestB = await signIn("guestb@mit.edu");
    const table = await createTable(host.session, 1);

    const initialPublic = await client.api.tables.view({ token: table.token });
    if ("error" in initialPublic) throw new Error(initialPublic.error);
    expect([initialPublic.remaining, initialPublic.reservedCount, initialPublic.waitlistCount]).toEqual([1, 0, 0]);

    const initialHost = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in initialHost) throw new Error(initialHost.error);
    expect([initialHost.reservedCount, initialHost.waitlistCount]).toEqual([0, 0]);

    // Guest A accepts the only seat.
    const acceptA = await client.api.tables.accept({ session: guestA.session, token: table.token });
    if ("error" in acceptA) throw new Error(acceptA.error);
    expect(typeof acceptA.place.reservation).toBe("string");
    expect(acceptA.place.position).toBeNull();

    const afterAcceptAPublic = await client.api.tables.view({ token: table.token });
    if ("error" in afterAcceptAPublic) throw new Error(afterAcceptAPublic.error);
    expect([afterAcceptAPublic.remaining, afterAcceptAPublic.reservedCount, afterAcceptAPublic.waitlistCount]).toEqual([0, 1, 0]);

    const placeA = await client.api.tables.place({ session: guestA.session, gathering: table.gathering });
    expect(placeA).toEqual({
      hosting: false,
      place: { reservation: acceptA.place.reservation, position: null },
    });

    const afterAcceptAHost = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in afterAcceptAHost) throw new Error(afterAcceptAHost.error);
    expect([afterAcceptAHost.reservedCount, afterAcceptAHost.waitlistCount]).toEqual([1, 0]);

    // Guest B joins the waitlist at position 1.
    const acceptB = await client.api.tables.accept({ session: guestB.session, token: table.token });
    if ("error" in acceptB) throw new Error(acceptB.error);
    expect(acceptB.place.reservation).toBeNull();
    expect(acceptB.place.position).toBe(1);

    const afterAcceptBPublic = await client.api.tables.view({ token: table.token });
    if ("error" in afterAcceptBPublic) throw new Error(afterAcceptBPublic.error);
    expect([afterAcceptBPublic.remaining, afterAcceptBPublic.reservedCount, afterAcceptBPublic.waitlistCount]).toEqual([0, 1, 1]);

    const placeBWaitlisted = await client.api.tables.place({ session: guestB.session, gathering: table.gathering });
    expect(placeBWaitlisted).toEqual({
      hosting: false,
      place: { reservation: null, position: 1 },
    });

    const afterAcceptBHost = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in afterAcceptBHost) throw new Error(afterAcceptBHost.error);
    expect([afterAcceptBHost.reservedCount, afterAcceptBHost.waitlistCount]).toEqual([1, 1]);

    // Guest A withdraws, immediately promoting Guest B from the waitlist into the seat.
    expect(await client.api.tables.withdraw({ session: guestA.session, gathering: table.gathering })).toEqual({ withdrawn: true });

    const afterWithdrawAPublic = await client.api.tables.view({ token: table.token });
    if ("error" in afterWithdrawAPublic) throw new Error(afterWithdrawAPublic.error);
    expect([afterWithdrawAPublic.remaining, afterWithdrawAPublic.reservedCount, afterWithdrawAPublic.waitlistCount]).toEqual([0, 1, 0]);

    const placeAAfterWithdraw = await client.api.tables.place({ session: guestA.session, gathering: table.gathering });
    expect(placeAAfterWithdraw).toEqual({
      hosting: false,
      place: { reservation: null, position: null },
    });

    const placeBPromoted = await client.api.tables.place({ session: guestB.session, gathering: table.gathering });
    if ("error" in placeBPromoted) throw new Error(placeBPromoted.error);
    expect(placeBPromoted.hosting).toBe(false);
    expect(typeof placeBPromoted.place.reservation).toBe("string");
    expect(placeBPromoted.place.position).toBeNull();

    const afterWithdrawAHost = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in afterWithdrawAHost) throw new Error(afterWithdrawAHost.error);
    expect([afterWithdrawAHost.reservedCount, afterWithdrawAHost.waitlistCount]).toEqual([1, 0]);

    // Guest B withdraws, freeing the seat.
    expect(await client.api.tables.withdraw({ session: guestB.session, gathering: table.gathering })).toEqual({ withdrawn: true });

    const afterWithdrawBPublic = await client.api.tables.view({ token: table.token });
    if ("error" in afterWithdrawBPublic) throw new Error(afterWithdrawBPublic.error);
    expect([afterWithdrawBPublic.remaining, afterWithdrawBPublic.reservedCount, afterWithdrawBPublic.waitlistCount]).toEqual([1, 0, 0]);

    const placeBAfterWithdraw = await client.api.tables.place({ session: guestB.session, gathering: table.gathering });
    expect(placeBAfterWithdraw).toEqual({
      hosting: false,
      place: { reservation: null, position: null },
    });

    const afterWithdrawBHost = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in afterWithdrawBHost) throw new Error(afterWithdrawBHost.error);
    expect([afterWithdrawBHost.reservedCount, afterWithdrawBHost.waitlistCount]).toEqual([0, 0]);
  });

  test("refuses host accepting their own table with CONFLICT and confirms hosting via tables.place", async () => {
    const host = await signIn("host@mit.edu");
    const table = await createTable(host.session, 2);

    expect(await client.api.tables.accept({ session: host.session, token: table.token })).toEqual({ error: "CONFLICT" });
    expect(await client.api.tables.place({ session: host.session, gathering: table.gathering })).toEqual({
      hosting: true,
      place: { reservation: null, position: null },
    });

    const publicView = await client.api.tables.view({ token: table.token });
    if ("error" in publicView) throw new Error(publicView.error);
    expect([publicView.remaining, publicView.reservedCount, publicView.waitlistCount]).toEqual([2, 0, 0]);

    const hostView = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in hostView) throw new Error(hostView.error);
    expect([hostView.reservedCount, hostView.waitlistCount]).toEqual([0, 0]);
  });

  test("revoking a link causes subsequent tables.view readback to return NOT_FOUND", async () => {
    const host = await signIn("host@mit.edu");
    const table = await createTable(host.session, 2);

    expect(await client.api.links.revoke({ session: host.session, link: table.link })).toEqual({ revoked: true });
    expect(await client.api.tables.view({ token: table.token })).toEqual({ error: "NOT_FOUND" });
  });

  test("toggling a share link off and back on updates links.list and restores tables.view, while refusing non-creators and invalid sessions", async () => {
    const host = await signIn("host@mit.edu");
    const other = await signIn("other@mit.edu");
    const table = await createTable(host.session, 2);

    const initialList = await client.api.links.list({ session: host.session, gathering: table.gathering });
    if ("error" in initialList) throw new Error(initialList.error);
    expect(initialList.shared.links.map((entry) => ({ link: entry.link, active: entry.active }))).toEqual([
      { link: table.link, active: true },
    ]);

    expect(await client.api.links.revoke({ session: host.session, link: table.link })).toEqual({ revoked: true });
    expect(await client.api.tables.view({ token: table.token })).toEqual({ error: "NOT_FOUND" });

    const offList = await client.api.links.list({ session: host.session, gathering: table.gathering });
    if ("error" in offList) throw new Error(offList.error);
    expect(offList.shared.links.map((entry) => ({ link: entry.link, active: entry.active }))).toEqual([
      { link: table.link, active: false },
    ]);

    expect(await client.api.links.activate({ session: other.session, link: table.link })).toEqual({ error: "FORBIDDEN" });
    expect(await client.api.links.activate({ session: "missing-session", link: table.link })).toEqual({ error: "UNAUTHORIZED" });

    expect(await client.api.links.activate({ session: host.session, link: table.link })).toEqual({ activated: true });

    const onList = await client.api.links.list({ session: host.session, gathering: table.gathering });
    if ("error" in onList) throw new Error(onList.error);
    expect(onList.shared.links.map((entry) => ({ link: entry.link, active: entry.active }))).toEqual([
      { link: table.link, active: true },
    ]);

    const restoredView = await client.api.tables.view({ token: table.token });
    if ("error" in restoredView) throw new Error(restoredView.error);
    expect(restoredView.gathering).toBe(table.gathering);
    expect(restoredView.title).toBe("Live Occupancy Dinner");
  });

  test("serves the built SPA HTML on GET /invite/sample-token", async () => {
    const response = await fetch(`http://127.0.0.1:${server!.port}/invite/sample-token`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<div id="app"></div>');
  });

  test("serves the built SPA HTML on GET /profile", async () => {
    const response = await fetch(`http://127.0.0.1:${server!.port}/profile`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<div id="app"></div>');
  });

  test("supports profile me, save, clear, and refusals over the typed HTTP client", async () => {
    const alice = await signIn("alice@mit.edu");

    const initial = await client.api.profiles.me({ session: alice.session });
    expect(initial).toEqual({
      email: "alice@mit.edu",
      accountName: null,
      displayName: "alice@mit.edu",
      preferredName: null,
      dietaryRestrictions: [],
      budgetPreferences: [],
      walkPreferenceMinutes: null,
      cuisinePreferences: [],
      notes: null,
    });

    expect(
      await client.api.profiles.save({
        session: alice.session,
        preferredName: "Ali",
        dietaryRestrictions: ["VEGETARIAN", "NUT_FREE", "SHELLFISH_FREE"],
        budgetPreferences: ["BUDGET", "MODERATE"],
        walkPreferenceMinutes: 15,
        cuisinePreferences: ["Thai", "Ramen"],
        notes: "Mild spice please",
      }),
    ).toEqual({ saved: true });

    const saved = await client.api.profiles.me({ session: alice.session });
    expect(saved).toEqual({
      email: "alice@mit.edu",
      accountName: null,
      displayName: "Ali",
      preferredName: "Ali",
      dietaryRestrictions: ["VEGETARIAN", "NUT_FREE", "SHELLFISH_FREE"],
      budgetPreferences: ["BUDGET", "MODERATE"],
      walkPreferenceMinutes: 15,
      cuisinePreferences: ["Thai", "Ramen"],
      notes: "Mild spice please",
    });

    // Optional fields can be cleared individually by omitting them / passing empty lists.
    expect(
      await client.api.profiles.save({
        session: alice.session,
        dietaryRestrictions: [],
        budgetPreferences: [],
        cuisinePreferences: [],
      }),
    ).toEqual({ saved: true });

    const afterNullSave = await client.api.profiles.me({ session: alice.session });
    if ("error" in afterNullSave) throw new Error(afterNullSave.error);
    expect(afterNullSave.displayName).toBe("alice@mit.edu");
    expect(afterNullSave.preferredName ?? null).toBeNull();
    expect(afterNullSave.walkPreferenceMinutes ?? null).toBeNull();
    expect(afterNullSave.notes ?? null).toBeNull();
    expect(afterNullSave.dietaryRestrictions).toEqual([]);
    expect(afterNullSave.budgetPreferences).toEqual([]);
    expect(afterNullSave.cuisinePreferences).toEqual([]);

    // Accepts upper boundary 1440 minutes and refuses invalid walk minutes and oversized fields, and invalid sessions.
    expect(
      await client.api.profiles.save({
        session: alice.session,
        walkPreferenceMinutes: 1440,
      }),
    ).toEqual({ saved: true });
    const atMaxWalk = await client.api.profiles.me({ session: alice.session });
    if ("error" in atMaxWalk) throw new Error(atMaxWalk.error);
    expect(atMaxWalk.walkPreferenceMinutes).toBe(1440);

    expect(
      await client.api.profiles.save({
        session: alice.session,
        walkPreferenceMinutes: 0,
      }),
    ).toEqual({ error: "INVALID_REQUEST" });
    expect(
      await client.api.profiles.save({
        session: alice.session,
        walkPreferenceMinutes: 1441,
      }),
    ).toEqual({ error: "INVALID_REQUEST" });
    expect(
      await client.api.profiles.save({
        session: alice.session,
        preferredName: "x".repeat(81),
      }),
    ).toEqual({ error: "INVALID_REQUEST" });
    expect(
      await client.api.profiles.save({
        session: alice.session,
        notes: "x".repeat(501),
      }),
    ).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.api.profiles.me({ session: "missing-session" })).toEqual({ error: "UNAUTHORIZED" });
    expect(await client.api.profiles.clear({ session: "missing-session" })).toEqual({ error: "UNAUTHORIZED" });

    expect(await client.api.profiles.clear({ session: alice.session })).toEqual({ cleared: true });
  });

  test("enforces input sanity limits across tables.create, gatherings.create, and links.create", async () => {
    const host = await signIn("sanity-host@mit.edu");
    const baseInput = {
      session: host.session,
      title: "Valid Title",
      area: "Kendall Square",
      cutoffTime: hoursFromNow(24),
      startTime: hoursFromNow(48),
      endTime: hoursFromNow(50),
      capacity: 4,
    };

    expect(await client.api.tables.create({ ...baseInput, title: "t".repeat(101) })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.api.tables.create({ ...baseInput, area: "a".repeat(101) })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.api.tables.create({ ...baseInput, confirmedVenue: "v".repeat(101) })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.api.tables.create({ ...baseInput, details: "d".repeat(301) })).toEqual({ error: "INVALID_REQUEST" });
    const longDomain = `${"s".repeat(97)}.edu`;
    const longScopeHost = await signIn(`scope-host@${longDomain}`);
    expect(await client.api.tables.create({ ...baseInput, session: longScopeHost.session, scope: longDomain })).toEqual({
      error: "INVALID_REQUEST",
    });
    expect(await client.api.tables.create({ ...baseInput, linkLabel: "l".repeat(81) })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.api.tables.create({ ...baseInput, capacity: 0 })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.api.tables.create({ ...baseInput, capacity: 51 })).toEqual({ error: "INVALID_REQUEST" });

    expect(await client.gatherings.create({ ...baseInput, title: "t".repeat(101) })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.gatherings.create({ ...baseInput, details: "d".repeat(301) })).toEqual({ error: "INVALID_REQUEST" });
    expect(await client.gatherings.create({ ...baseInput, capacity: 0 })).toEqual({ error: "INVALID_REQUEST" });

    const created = await client.api.tables.create({
      ...baseInput,
      title: "t".repeat(100),
      area: "a".repeat(100),
      confirmedVenue: "v".repeat(100),
      details: "d".repeat(300),
      linkLabel: "l".repeat(80),
      capacity: 50,
    });
    if ("error" in created) throw new Error(`boundary create refused: ${created.error}`);

    expect(
      await client.api.links.create({
        session: host.session,
        gathering: created.gathering,
        label: "l".repeat(81),
      }),
    ).toEqual({ error: "INVALID_REQUEST" });

    const maxLabel = "m".repeat(80);
    const createdLink = await client.api.links.create({
      session: host.session,
      gathering: created.gathering,
      label: maxLabel,
    });
    if ("error" in createdLink) throw new Error(`boundary link refused: ${createdLink.error}`);

    const listed = await client.api.links.list({ session: host.session, gathering: created.gathering });
    if ("error" in listed) throw new Error(listed.error);
    expect(listed.shared.links.some((entry) => entry.link === createdLink.link && entry.label === maxLabel)).toBe(true);
  });

  test("serves built web/dist assets cleanly and aligns Vue components with input sanity limits", async () => {
    const indexResponse = await fetch(`http://127.0.0.1:${server!.port}/`);
    expect(indexResponse.status).toBe(200);
    const html = await indexResponse.text();
    const scriptMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
    const styleMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
    expect(scriptMatch).not.toBeNull();
    expect(styleMatch).not.toBeNull();

    const jsResponse = await fetch(`http://127.0.0.1:${server!.port}${scriptMatch![1]}`);
    expect(jsResponse.status).toBe(200);
    expect(jsResponse.headers.get("content-type")).toContain("javascript");
    const jsBody = await jsResponse.text();
    expect(jsBody).toContain("up to 1440 minutes");
    expect(jsBody).toContain("Link name must be 80 characters or fewer.");
    expect(jsBody).toContain("guest spots from 1 to 50");

    const cssResponse = await fetch(`http://127.0.0.1:${server!.port}${styleMatch![1]}`);
    expect(cssResponse.status).toBe(200);
    expect(cssResponse.headers.get("content-type")).toContain("css");
    const cssBody = await cssResponse.text();
    expect(cssBody.length).toBeGreaterThan(0);

    const webComponentsDir = path.resolve(import.meta.dir, "../web/components");
    const homeSource = readFileSync(path.join(webComponentsDir, "HomeView.vue"), "utf8");
    const tableSource = readFileSync(path.join(webComponentsDir, "TableView.vue"), "utf8");
    const inviteSource = readFileSync(path.join(webComponentsDir, "InviteView.vue"), "utf8");
    const pollSource = readFileSync(path.join(webComponentsDir, "TablePoll.vue"), "utf8");
    const profileSource = readFileSync(path.join(webComponentsDir, "ProfileView.vue"), "utf8");

    expect(jsBody).toContain("Location poll");
    expect(jsBody).toContain("Suggest a spot (e.g. Flour Bakery)");
    expect(jsBody).toContain("That location is already in the poll.");
    expect(jsBody).toContain("Voting closed because the table's venue is already set.");
    expect(cssBody).toContain("poll-option-main");
    expect(cssBody).toContain("poll-vote-btn");

    expect(homeSource).toContain('min="1" max="50"');
    expect(homeSource).toContain('maxlength="100"');
    expect(homeSource).toContain('maxlength="300"');
    expect(tableSource).toContain('maxlength="80"');
    expect(tableSource).toContain("Link name must be 80 characters or fewer.");
    const tableTemplate = tableSource.slice(tableSource.indexOf("<template>"));
    const inviteTemplate = inviteSource.slice(inviteSource.indexOf("<template>"));
    expect(tableTemplate.indexOf("<TablePoll")).toBeGreaterThan(-1);
    expect(tableTemplate.indexOf("<TablePoll")).toBeLessThan(tableTemplate.indexOf("<TableRoster"));
    expect(inviteTemplate.indexOf("<TablePoll")).toBeGreaterThan(-1);
    expect(inviteTemplate.indexOf("<TablePoll")).toBeLessThan(inviteTemplate.indexOf("<TableRoster"));
    expect(pollSource).toContain('maxlength="100"');
    expect(pollSource).toContain('class="card poll-summary"');
    expect(profileSource).toContain('min="1" max="1440"');
    expect(profileSource).toContain("Max travel time must be a positive number up to 1440 minutes.");
  });

  test("live table roster updates across seat accept, waitlist promotion, withdrawal, profile edits, and closes on cancel", async () => {
    const host = await signIn("host-roster@mit.edu");
    const guestA = await signIn("guesta-roster@mit.edu");
    const guestB = await signIn("guestb-roster@mit.edu");
    const outsider = await signIn("outsider-roster@mit.edu");

    await client.api.profiles.save({
      session: host.session,
      preferredName: "Host Pat",
      budgetPreferences: ["MODERATE"],
    });
    await client.api.profiles.save({
      session: guestA.session,
      preferredName: "Guest A",
      dietaryRestrictions: ["HALAL", "SHELLFISH_FREE"],
      walkPreferenceMinutes: 10,
      cuisinePreferences: ["Mediterranean"],
      notes: "No cilantro",
    });

    const table = await createTable(host.session, 1);

    // Host can see initial roster with empty seated list.
    const hostInitial = await client.api.tables.profiles({ session: host.session, gathering: table.gathering });
    expect(hostInitial).toEqual({
      host: {
        user: host.user,
        displayName: "Host Pat",
        preferredName: "Host Pat",
        dietaryRestrictions: [],
        budgetPreferences: ["MODERATE"],
        walkPreferenceMinutes: null,
        cuisinePreferences: [],
        notes: null,
      },
      seated: [],
    });

    // Outsider cannot read roster.
    expect(await client.api.tables.profiles({ session: outsider.session, gathering: table.gathering })).toEqual({
      error: "FORBIDDEN",
    });

    // Guest A accepts the seat and can view the roster.
    const acceptA = await client.api.tables.accept({ session: guestA.session, token: table.token });
    if ("error" in acceptA) throw new Error(acceptA.error);
    const guestARoster = await client.api.tables.profiles({ session: guestA.session, gathering: table.gathering });
    expect(guestARoster).toEqual({
      host: {
        user: host.user,
        displayName: "Host Pat",
        preferredName: "Host Pat",
        dietaryRestrictions: [],
        budgetPreferences: ["MODERATE"],
        walkPreferenceMinutes: null,
        cuisinePreferences: [],
        notes: null,
      },
      seated: [
        {
          user: guestA.user,
          displayName: "Guest A",
          preferredName: "Guest A",
          dietaryRestrictions: ["HALAL", "SHELLFISH_FREE"],
          budgetPreferences: [],
          walkPreferenceMinutes: 10,
          cuisinePreferences: ["Mediterranean"],
          notes: "No cilantro",
        },
      ],
    });

    // Waitlisted-only Guest B is refused FORBIDDEN until promoted.
    const acceptB = await client.api.tables.accept({ session: guestB.session, token: table.token });
    if ("error" in acceptB) throw new Error(acceptB.error);
    expect(acceptB.place.position).toBe(1);
    expect(await client.api.tables.profiles({ session: guestB.session, gathering: table.gathering })).toEqual({
      error: "FORBIDDEN",
    });

    // Guest A withdraws: Guest A loses roster access, Guest B is promoted and gains roster access.
    expect(await client.api.tables.withdraw({ session: guestA.session, gathering: table.gathering })).toEqual({ withdrawn: true });
    expect(await client.api.tables.profiles({ session: guestA.session, gathering: table.gathering })).toEqual({
      error: "FORBIDDEN",
    });
    const guestBRoster = await client.api.tables.profiles({ session: guestB.session, gathering: table.gathering });
    if ("error" in guestBRoster) throw new Error(guestBRoster.error);
    expect(guestBRoster.seated.map((entry) => entry.user)).toEqual([guestB.user]);

    // Cancelling the table transitions /api/tables/profiles to CONFLICT.
    expect(await client.gatherings.cancel({ session: host.session, gathering: table.gathering })).toEqual({});
    expect(await client.api.tables.profiles({ session: host.session, gathering: table.gathering })).toEqual({
      error: "CONFLICT",
    });
    expect(await client.api.tables.profiles({ session: host.session, gathering: "missing-gathering" })).toEqual({
      error: "NOT_FOUND",
    });
    expect(await client.api.tables.profiles({ session: "missing-session", gathering: table.gathering })).toEqual({
      error: "UNAUTHORIZED",
    });
  });

  test("returns transport fault union when profile request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = await client.api.profiles.me({ session: "any" }, { signal: controller.signal });
    expect("error" in aborted).toBe(true);
    if ("error" in aborted) {
      expect(aborted.error).toBe("ABORTED");
    }
  });

  test("live table location poll supports proposals, voting, withdrawal vote cleanup, host choose-venue, and refusals", async () => {
    const host = await signIn("poll-host@mit.edu");
    const guestA = await signIn("poll-guesta@mit.edu");
    const guestB = await signIn("poll-guestb@mit.edu");
    const outsider = await signIn("poll-outsider@mit.edu");

    const table = await createTable(host.session, 1);

    // Initially open and empty for host; outsider and missing session/table are refused.
    const initialPoll = await client.api.tables.poll({ session: host.session, gathering: table.gathering });
    if ("error" in initialPoll) throw new Error(initialPoll.error);
    expect(initialPoll.open).toBe(true);
    expect(initialPoll.confirmedVenue ?? null).toBeNull();
    expect(initialPoll.hosting).toBe(true);
    expect(initialPoll.votedOption).toBeNull();
    expect(initialPoll.options).toEqual([]);
    expect(await client.api.tables.poll({ session: outsider.session, gathering: table.gathering })).toEqual({
      error: "FORBIDDEN",
    });
    expect(await client.api.tables.poll({ session: "missing-session", gathering: table.gathering })).toEqual({
      error: "UNAUTHORIZED",
    });
    expect(await client.api.tables.poll({ session: host.session, gathering: "missing-gathering" })).toEqual({
      error: "NOT_FOUND",
    });

    // Guest A accepts the single seat; Guest B joins the waitlist.
    const acceptA = await client.api.tables.accept({ session: guestA.session, token: table.token });
    if ("error" in acceptA) throw new Error(acceptA.error);
    const acceptB = await client.api.tables.accept({ session: guestB.session, token: table.token });
    if ("error" in acceptB) throw new Error(acceptB.error);
    expect(acceptB.place.position).toBe(1);

    // Waitlisted Guest B cannot view or mutate the poll.
    expect(await client.api.tables.poll({ session: guestB.session, gathering: table.gathering })).toEqual({
      error: "FORBIDDEN",
    });
    expect(
      await client.api.tables.poll.add({ session: guestB.session, gathering: table.gathering, label: "Veggie Galaxy" }),
    ).toEqual({ error: "FORBIDDEN" });

    // Seated Guest A adds an option and votes for it; Host adds another option.
    const addedFlour = await client.api.tables.poll.add({
      session: guestA.session,
      gathering: table.gathering,
      label: "Flour Bakery",
    });
    if ("error" in addedFlour) throw new Error(addedFlour.error);
    expect(await client.api.tables.poll.vote({ session: guestA.session, gathering: table.gathering, option: addedFlour.option })).toEqual({
      voted: true,
    });

    const addedTatte = await client.api.tables.poll.add({
      session: host.session,
      gathering: table.gathering,
      label: "Tatte",
    });
    if ("error" in addedTatte) throw new Error(addedTatte.error);

    // Validation and duplicate refusals.
    expect(await client.api.tables.poll.add({ session: host.session, gathering: table.gathering, label: "   " })).toEqual({
      error: "INVALID_REQUEST",
    });
    expect(
      await client.api.tables.poll.add({ session: host.session, gathering: table.gathering, label: "flour bakery" }),
    ).toEqual({ error: "CONFLICT" });

    // Guest A sees canRemove=true only for their own option; cannot remove host's option.
    const pollForGuestA = await client.api.tables.poll({ session: guestA.session, gathering: table.gathering });
    if ("error" in pollForGuestA) throw new Error(pollForGuestA.error);
    expect(pollForGuestA.open).toBe(true);
    expect(pollForGuestA.confirmedVenue ?? null).toBeNull();
    expect(pollForGuestA.hosting).toBe(false);
    expect(pollForGuestA.votedOption).toBe(addedFlour.option);
    expect(pollForGuestA.options).toEqual([
      { option: addedFlour.option, label: "Flour Bakery", voteCount: 1, canRemove: true },
      { option: addedTatte.option, label: "Tatte", voteCount: 0, canRemove: false },
    ]);
    expect(
      await client.api.tables.poll.remove({ session: guestA.session, gathering: table.gathering, option: addedTatte.option }),
    ).toEqual({ error: "FORBIDDEN" });

    // Host votes Tatte, switches to Flour Bakery, then clears vote.
    expect(await client.api.tables.poll.vote({ session: host.session, gathering: table.gathering, option: addedTatte.option })).toEqual({
      voted: true,
    });
    expect(await client.api.tables.poll.vote({ session: host.session, gathering: table.gathering, option: addedFlour.option })).toEqual({
      voted: true,
    });
    const hostBothVoted = await client.api.tables.poll({ session: host.session, gathering: table.gathering });
    if ("error" in hostBothVoted) throw new Error(hostBothVoted.error);
    expect(hostBothVoted.votedOption).toBe(addedFlour.option);
    expect(hostBothVoted.options.map((o) => [o.label, o.voteCount, o.canRemove])).toEqual([
      ["Flour Bakery", 2, true],
      ["Tatte", 0, true],
    ]);

    expect(await client.api.tables.poll.unvote({ session: host.session, gathering: table.gathering })).toEqual({ cleared: true });

    // Guest A withdraws: Guest A's vote is cleared by reaction, Guest A loses poll access, Guest B is promoted and gains poll access.
    expect(await client.api.tables.withdraw({ session: guestA.session, gathering: table.gathering })).toEqual({ withdrawn: true });
    expect(await client.api.tables.poll({ session: guestA.session, gathering: table.gathering })).toEqual({
      error: "FORBIDDEN",
    });

    const pollForGuestB = await client.api.tables.poll({ session: guestB.session, gathering: table.gathering });
    if ("error" in pollForGuestB) throw new Error(pollForGuestB.error);
    expect(pollForGuestB.open).toBe(true);
    expect(pollForGuestB.votedOption).toBeNull();
    expect(pollForGuestB.options.map((o) => [o.label, o.voteCount, o.canRemove])).toEqual([
      ["Flour Bakery", 1 - 1, false],
      ["Tatte", 0, false],
    ]);

    // Guest B cannot pick the venue; host picks Flour Bakery, closing the poll and updating table views.
    expect(
      await client.api.tables.poll["choose-venue"]({
        session: guestB.session,
        gathering: table.gathering,
        option: addedFlour.option,
      }),
    ).toEqual({ error: "NOT_FOUND" });

    expect(
      await client.api.tables.poll["choose-venue"]({
        session: host.session,
        gathering: table.gathering,
        option: addedFlour.option,
      }),
    ).toEqual({ confirmedVenue: "Flour Bakery" });

    const updatedHostTable = await client.gatherings.view({ session: host.session, gathering: table.gathering });
    if ("error" in updatedHostTable) throw new Error(updatedHostTable.error);
    expect(updatedHostTable.confirmedVenue).toBe("Flour Bakery");

    const updatedPublicTable = await client.api.tables.view({ token: table.token });
    if ("error" in updatedPublicTable) throw new Error(updatedPublicTable.error);
    expect(updatedPublicTable.confirmedVenue).toBe("Flour Bakery");

    const closedPoll = await client.api.tables.poll({ session: guestB.session, gathering: table.gathering });
    if ("error" in closedPoll) throw new Error(closedPoll.error);
    expect(closedPoll.open).toBe(false);
    expect(closedPoll.confirmedVenue).toBe("Flour Bakery");
    expect(closedPoll.options).toHaveLength(2);

    // Poll mutations fail with CONFLICT once venue is set.
    expect(await client.api.tables.poll.add({ session: host.session, gathering: table.gathering, label: "Area Four" })).toEqual({
      error: "CONFLICT",
    });
    expect(
      await client.api.tables.poll.vote({ session: guestB.session, gathering: table.gathering, option: addedTatte.option }),
    ).toEqual({ error: "CONFLICT" });
    expect(await client.api.tables.poll.unvote({ session: host.session, gathering: table.gathering })).toEqual({
      error: "CONFLICT",
    });
    expect(
      await client.api.tables.poll.remove({ session: host.session, gathering: table.gathering, option: addedTatte.option }),
    ).toEqual({ error: "CONFLICT" });
    expect(
      await client.api.tables.poll["choose-venue"]({
        session: host.session,
        gathering: table.gathering,
        option: addedTatte.option,
      }),
    ).toEqual({ error: "CONFLICT" });

    // Table created with a pre-set confirmedVenue starts closed with 0 options.
    const presetCreated = await client.api.tables.create({
      session: host.session,
      title: "Preset Venue Table",
      area: "Kendall Square",
      cutoffTime: hoursFromNow(24),
      startTime: hoursFromNow(48),
      endTime: hoursFromNow(50),
      capacity: 3,
      confirmedVenue: "Oleana",
    });
    if ("error" in presetCreated) throw new Error(presetCreated.error);
    expect(await client.api.tables.poll({ session: host.session, gathering: presetCreated.gathering })).toEqual({
      open: false,
      confirmedVenue: "Oleana",
      hosting: true,
      votedOption: null,
      options: [],
    });

    // Cancelling a table makes poll return CONFLICT (TABLE_INACTIVE).
    expect(await client.gatherings.cancel({ session: host.session, gathering: table.gathering })).toEqual({});
    expect(await client.api.tables.poll({ session: host.session, gathering: table.gathering })).toEqual({
      error: "CONFLICT",
    });
  });

  test("returns transport fault union when poll request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = await client.api.tables.poll({ session: "any", gathering: "any" }, { signal: controller.signal });
    expect("error" in aborted).toBe(true);
    if ("error" in aborted) {
      expect(aborted.error).toBe("ABORTED");
    }
  });
});
