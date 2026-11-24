import { describe, expect, test } from "bun:test";
import { AuthenticatingConcept } from "../src/concepts/Authenticating.ts";
import { HostingConcept } from "../src/concepts/Hosting.ts";
import { SessioningConcept } from "../src/concepts/Sessioning.ts";
import { createApplicationHttpHandler } from "../src/host.ts";
import { testDatabase } from "./support/mongo.ts";

async function postJson(
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function createUserSession(
  database: Awaited<ReturnType<typeof testDatabase>>,
  {
    externalId,
    email,
    name,
    affiliation = "student",
  }: { externalId: string; email: string; name?: string; affiliation?: string },
) {
  const auth = new AuthenticatingConcept(database);
  const sessions = new SessioningConcept(database);
  const { user } = await auth.authenticate({ externalId, email, name, affiliation });
  const { session } = await sessions.start({
    subject: user,
    lifetime: 60 * 60 * 1000,
    now: new Date(),
  });
  return { user, session, email, name };
}

function futureTableTimes() {
  const now = Date.now();
  return {
    cutoffTime: new Date(now + 60 * 60 * 1000).toISOString(),
    startTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
  };
}

describe("Profiles endpoints and table roster access", () => {
  test("self-profile endpoints enforce session, return defaults, save/normalize, refuse invalid input, and clear", async () => {
    const db = await testDatabase();
    const handler = createApplicationHttpHandler({ database: db });

    // Unknown session rejected on all profile endpoints
    for (const path of ["/api/profiles/me", "/api/profiles/save", "/api/profiles/clear"]) {
      const res = await postJson(handler, path, { session: "not-a-real-session" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "UNAUTHORIZED" });
    }

    const bea = await createUserSession(db, {
      externalId: "bea",
      email: "bea@mit.edu",
      name: "Bea K.",
    });
    const nameless = await createUserSession(db, {
      externalId: "nameless",
      email: "nameless@mit.edu",
    });

    // Initial /api/profiles/me without a stored profile
    const initialBea = await postJson(handler, "/api/profiles/me", { session: bea.session });
    expect(initialBea.status).toBe(200);
    expect(initialBea.body).toEqual({
      email: "bea@mit.edu",
      accountName: "Bea K.",
      displayName: "Bea K.",
      preferredName: null,
      dietaryRestrictions: [],
      budgetPreferences: [],
      walkPreferenceMinutes: null,
      cuisinePreferences: [],
      notes: null,
    });

    const initialNameless = await postJson(handler, "/api/profiles/me", { session: nameless.session });
    expect(initialNameless.status).toBe(200);
    expect(initialNameless.body.displayName).toBe("nameless@mit.edu");
    expect(initialNameless.body.accountName ?? null).toBeNull();

    // Save a full normalized profile
    const saved = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      preferredName: "  Bea Preferred  ",
      dietaryRestrictions: ["VEGETARIAN", "NUT_FREE", "VEGETARIAN"],
      budgetPreferences: ["BUDGET", "MODERATE", "BUDGET"],
      walkPreferenceMinutes: 15,
      cuisinePreferences: [" Thai ", "", "Ramen", "Thai"],
      notes: "  Happy to split plates!  ",
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ saved: true });

    const afterSave = await postJson(handler, "/api/profiles/me", { session: bea.session });
    expect(afterSave.status).toBe(200);
    expect(afterSave.body).toEqual({
      email: "bea@mit.edu",
      accountName: "Bea K.",
      displayName: "Bea Preferred",
      preferredName: "Bea Preferred",
      dietaryRestrictions: ["VEGETARIAN", "NUT_FREE"],
      budgetPreferences: ["BUDGET", "MODERATE"],
      walkPreferenceMinutes: 15,
      cuisinePreferences: ["Thai", "Ramen"],
      notes: "Happy to split plates!",
    });

    // Validation refusals leave stored profile unchanged
    const badDistance = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      walkPreferenceMinutes: 0,
    });
    expect(badDistance.status).toBe(400);
    expect(badDistance.body).toEqual({ error: "INVALID_REQUEST" });

    const negativeDistance = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      walkPreferenceMinutes: -5,
    });
    expect(negativeDistance.status).toBe(400);
    expect(negativeDistance.body).toEqual({ error: "INVALID_REQUEST" });

    const badTag = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      dietaryRestrictions: ["PALEO"],
    });
    expect(badTag.status).toBe(400);
    expect(badTag.body).toEqual({ error: "INVALID_REQUEST" });

    const badBudget = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      budgetPreferences: ["LUXURY"],
    });
    expect(badBudget.status).toBe(400);
    expect(badBudget.body).toEqual({ error: "INVALID_REQUEST" });

    const longName = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      preferredName: "a".repeat(81),
    });
    expect(longName.status).toBe(400);
    expect(longName.body).toEqual({ error: "INVALID_REQUEST" });

    const longNotes = await postJson(handler, "/api/profiles/save", {
      session: bea.session,
      notes: "n".repeat(501),
    });
    expect(longNotes.status).toBe(400);
    expect(longNotes.body).toEqual({ error: "INVALID_REQUEST" });

    const stillIntact = await postJson(handler, "/api/profiles/me", { session: bea.session });
    expect(stillIntact.status).toBe(200);
    expect(stillIntact.body.preferredName).toBe("Bea Preferred");
    expect(stillIntact.body.walkPreferenceMinutes).toBe(15);

    // Clear profile idempotently restores fallback displayName and empty preferences
    const cleared = await postJson(handler, "/api/profiles/clear", { session: bea.session });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ cleared: true });

    const afterClear = await postJson(handler, "/api/profiles/me", { session: bea.session });
    expect(afterClear.status).toBe(200);
    expect(afterClear.body).toEqual({
      email: "bea@mit.edu",
      accountName: "Bea K.",
      displayName: "Bea K.",
      preferredName: null,
      dietaryRestrictions: [],
      budgetPreferences: [],
      walkPreferenceMinutes: null,
      cuisinePreferences: [],
      notes: null,
    });

    const clearedAgain = await postJson(handler, "/api/profiles/clear", { session: bea.session });
    expect(clearedAgain.status).toBe(200);
    expect(clearedAgain.body).toEqual({ cleared: true });

    // Saving with only session uses endpoint defaults and falls back to accountName
    const minimalSave = await postJson(handler, "/api/profiles/save", { session: bea.session });
    expect(minimalSave.status).toBe(200);
    expect(minimalSave.body).toEqual({ saved: true });

    const afterMinimalSave = await postJson(handler, "/api/profiles/me", { session: bea.session });
    expect(afterMinimalSave.status).toBe(200);
    expect(afterMinimalSave.body).toEqual({
      email: "bea@mit.edu",
      accountName: "Bea K.",
      displayName: "Bea K.",
      dietaryRestrictions: [],
      budgetPreferences: [],
      cuisinePreferences: [],
    });
    expect(afterMinimalSave.body.preferredName ?? null).toBeNull();
    expect(afterMinimalSave.body.walkPreferenceMinutes ?? null).toBeNull();
    expect(afterMinimalSave.body.notes ?? null).toBeNull();
  });

  test("/api/tables/profiles enforces roster access, displayName fallback, withdrawal/promotion, and table status", async () => {
    const db = await testDatabase();
    const handler = createApplicationHttpHandler({ database: db });

    const host = await createUserSession(db, {
      externalId: "host",
      email: "host@mit.edu",
      name: "Host Account",
    });
    const guest1 = await createUserSession(db, {
      externalId: "guest1",
      email: "guest1@mit.edu",
      name: "Guest One",
    });
    const guest2 = await createUserSession(db, {
      externalId: "guest2",
      email: "guest2@mit.edu",
    });
    const outsider = await createUserSession(db, {
      externalId: "outsider",
      email: "outsider@mit.edu",
      name: "Outsider",
    });

    // Save preferences for host and guest2 (guest1 has no profile, guest2 has no Touchstone name)
    await postJson(handler, "/api/profiles/save", {
      session: host.session,
      preferredName: "Chef Host",
      dietaryRestrictions: ["HALAL"],
      budgetPreferences: ["MODERATE"],
      walkPreferenceMinutes: 10,
      cuisinePreferences: ["Mediterranean"],
      notes: "Meet at Lobby 7",
    });
    await postJson(handler, "/api/profiles/save", {
      session: guest2.session,
      dietaryRestrictions: ["VEGAN"],
      budgetPreferences: ["BUDGET", "MODERATE"],
      cuisinePreferences: ["Ethiopian"],
      notes: "Running 5 mins late",
    });

    // Create a capacity-1 table so guest1 is seated and guest2 is waitlisted
    const times = futureTableTimes();
    const created = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Dinner in Kendall",
      area: "Kendall Square",
      ...times,
      confirmedVenue: "Row 34",
      capacity: 1,
    });
    expect(created.status).toBe(200);
    const { gathering, token } = created.body as { gathering: string; token: string };

    // Signed-out / unknown session refused
    const noAuth = await postJson(handler, "/api/tables/profiles", {
      session: "invalid-session",
      gathering,
    });
    expect(noAuth.status).toBe(401);
    expect(noAuth.body).toEqual({ error: "UNAUTHORIZED" });

    // Unknown gathering refused NOT_FOUND
    const unknownTable = await postJson(handler, "/api/tables/profiles", {
      session: host.session,
      gathering: "nonexistent-gathering",
    });
    expect(unknownTable.status).toBe(404);
    expect(unknownTable.body).toEqual({ error: "NOT_FOUND" });

    // Guest 1 accepts and takes the 1 seat; Guest 2 accepts and lands on waitlist
    const accept1 = await postJson(handler, "/api/tables/accept", { session: guest1.session, token });
    expect(accept1.status).toBe(200);
    expect(accept1.body.place.reservation).toBeTruthy();

    const accept2 = await postJson(handler, "/api/tables/accept", { session: guest2.session, token });
    expect(accept2.status).toBe(200);
    expect(accept2.body.place.position).toBe(1);

    // Host can view roster and sees preferredName + guest1's Touchstone fallback without raw emails
    const hostView = await postJson(handler, "/api/tables/profiles", {
      session: host.session,
      gathering,
    });
    expect(hostView.status).toBe(200);
    expect(hostView.body.host).toEqual({
      user: host.user,
      displayName: "Chef Host",
      preferredName: "Chef Host",
      dietaryRestrictions: ["HALAL"],
      budgetPreferences: ["MODERATE"],
      walkPreferenceMinutes: 10,
      cuisinePreferences: ["Mediterranean"],
      notes: "Meet at Lobby 7",
    });
    expect("email" in hostView.body.host).toBe(false);
    expect(hostView.body.seated).toHaveLength(1);
    expect(hostView.body.seated[0]).toEqual({
      user: guest1.user,
      displayName: "Guest One",
      preferredName: null,
      dietaryRestrictions: null,
      budgetPreferences: null,
      walkPreferenceMinutes: null,
      cuisinePreferences: null,
      notes: null,
    });
    expect("email" in hostView.body.seated[0]).toBe(false);

    // Seated guest1 can view roster
    const guest1View = await postJson(handler, "/api/tables/profiles", {
      session: guest1.session,
      gathering,
    });
    expect(guest1View.status).toBe(200);
    expect(guest1View.body.host.displayName).toBe("Chef Host");
    expect(guest1View.body.seated).toHaveLength(1);

    // Waitlisted guest2 and arbitrary outsider are refused FORBIDDEN
    const waitlistedView = await postJson(handler, "/api/tables/profiles", {
      session: guest2.session,
      gathering,
    });
    expect(waitlistedView.status).toBe(403);
    expect(waitlistedView.body).toEqual({ error: "FORBIDDEN" });

    const outsiderView = await postJson(handler, "/api/tables/profiles", {
      session: outsider.session,
      gathering,
    });
    expect(outsiderView.status).toBe(403);
    expect(outsiderView.body).toEqual({ error: "FORBIDDEN" });

    // Guest 1 withdraws -> Guest 2 is promoted, Guest 1 loses access, Guest 2 gains access
    const withdraw1 = await postJson(handler, "/api/tables/withdraw", {
      session: guest1.session,
      gathering,
    });
    expect(withdraw1.status).toBe(200);

    const withdrawnGuest1View = await postJson(handler, "/api/tables/profiles", {
      session: guest1.session,
      gathering,
    });
    expect(withdrawnGuest1View.status).toBe(403);
    expect(withdrawnGuest1View.body).toEqual({ error: "FORBIDDEN" });

    const promotedGuest2View = await postJson(handler, "/api/tables/profiles", {
      session: guest2.session,
      gathering,
    });
    expect(promotedGuest2View.status).toBe(200);
    expect(promotedGuest2View.body.seated).toEqual([
      {
        user: guest2.user,
        displayName: "guest2@mit.edu",
        preferredName: null,
        dietaryRestrictions: ["VEGAN"],
        budgetPreferences: ["BUDGET", "MODERATE"],
        walkPreferenceMinutes: null,
        cuisinePreferences: ["Ethiopian"],
        notes: "Running 5 mins late",
      },
    ]);

    // Table remains viewable while CONFIRMED and BOOKED
    const confirmed = await postJson(handler, "/gatherings/confirm", {
      session: host.session,
      gathering,
    });
    expect(confirmed.status).toBe(200);

    const confirmedView = await postJson(handler, "/api/tables/profiles", {
      session: guest2.session,
      gathering,
    });
    expect(confirmedView.status).toBe(200);

    const booked = await postJson(handler, "/gatherings/book", {
      session: host.session,
      gathering,
    });
    expect(booked.status).toBe(200);

    const bookedView = await postJson(handler, "/api/tables/profiles", {
      session: guest2.session,
      gathering,
    });
    expect(bookedView.status).toBe(200);

    // Cancelling table closes roster viewing with CONFLICT
    const cancelled = await postJson(handler, "/gatherings/cancel", {
      session: host.session,
      gathering,
    });
    expect(cancelled.status).toBe(200);

    for (const viewerSession of [host.session, guest2.session]) {
      const cancelledView = await postJson(handler, "/api/tables/profiles", {
        session: viewerSession,
        gathering,
      });
      expect(cancelledView.status).toBe(409);
      expect(cancelledView.body).toEqual({ error: "CONFLICT" });
    }

    // Closed table also refuses with CONFLICT
    const closedTable = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Expired Table",
      area: "Central Square",
      ...futureTableTimes(),
      capacity: 2,
    });
    expect(closedTable.status).toBe(200);
    const closedGathering = closedTable.body.gathering as string;
    await new HostingConcept(db).expireUnconfirmed({
      gathering: closedGathering,
      now: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    const closedView = await postJson(handler, "/api/tables/profiles", {
      session: host.session,
      gathering: closedGathering,
    });
    expect(closedView.status).toBe(409);
    expect(closedView.body).toEqual({ error: "CONFLICT" });
  });
});
