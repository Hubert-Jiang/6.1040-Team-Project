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

describe("Polls endpoints and internal vote cleanup", () => {
  test("enforces session, table existence, active status, participant/host access, and optional field serialization", async () => {
    const db = await testDatabase();
    const handler = createApplicationHttpHandler({ database: db });

    const host = await createUserSession(db, { externalId: "host", email: "host@mit.edu", name: "Host" });
    const guest1 = await createUserSession(db, { externalId: "guest1", email: "guest1@mit.edu", name: "Guest One" });
    const guest2 = await createUserSession(db, { externalId: "guest2", email: "guest2@mit.edu", name: "Guest Two" });
    const outsider = await createUserSession(db, { externalId: "outsider", email: "outsider@mit.edu", name: "Outsider" });

    // Unknown session rejected across all 6 poll endpoints
    const unknownSessionCases: Array<[string, Record<string, unknown>]> = [
      ["/api/tables/poll", { session: "bad", gathering: "g1" }],
      ["/api/tables/poll/add", { session: "bad", gathering: "g1", label: "Sichuan" }],
      ["/api/tables/poll/vote", { session: "bad", gathering: "g1", option: "o1" }],
      ["/api/tables/poll/unvote", { session: "bad", gathering: "g1" }],
      ["/api/tables/poll/remove", { session: "bad", gathering: "g1", option: "o1" }],
      ["/api/tables/poll/choose-venue", { session: "bad", gathering: "g1", option: "o1" }],
    ];
    for (const [path, body] of unknownSessionCases) {
      const res = await postJson(handler, path, body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "UNAUTHORIZED" });
    }

    // Unknown gathering rejected with NOT_FOUND across all 6 poll endpoints
    const missingTableCases: Array<[string, Record<string, unknown>]> = [
      ["/api/tables/poll", { session: host.session, gathering: "no-such-table" }],
      ["/api/tables/poll/add", { session: host.session, gathering: "no-such-table", label: "Sichuan" }],
      ["/api/tables/poll/vote", { session: host.session, gathering: "no-such-table", option: "o1" }],
      ["/api/tables/poll/unvote", { session: host.session, gathering: "no-such-table" }],
      ["/api/tables/poll/remove", { session: host.session, gathering: "no-such-table", option: "o1" }],
      ["/api/tables/poll/choose-venue", { session: host.session, gathering: "no-such-table", option: "o1" }],
    ];
    for (const [path, body] of missingTableCases) {
      const res = await postJson(handler, path, body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "NOT_FOUND" });
    }

    // Create a capacity-1 table without confirmedVenue
    const created = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Kendall Lunch",
      area: "Kendall Square",
      ...futureTableTimes(),
      capacity: 1,
    });
    expect(created.status).toBe(200);
    const { gathering, token } = created.body as { gathering: string; token: string };

    // guest1 is seated, guest2 is waitlisted
    const accept1 = await postJson(handler, "/api/tables/accept", { session: guest1.session, token });
    expect(accept1.status).toBe(200);
    expect(accept1.body.place.reservation).toBeTruthy();

    const accept2 = await postJson(handler, "/api/tables/accept", { session: guest2.session, token });
    expect(accept2.status).toBe(200);
    expect(accept2.body.place.position).toBe(1);

    // Waitlisted guest2 and outsider are refused FORBIDDEN on ViewPoll and editing endpoints
    for (const deniedSession of [guest2.session, outsider.session]) {
      expect(await postJson(handler, "/api/tables/poll", { session: deniedSession, gathering })).toEqual({
        status: 403,
        body: { error: "FORBIDDEN" },
      });
      expect(await postJson(handler, "/api/tables/poll/add", { session: deniedSession, gathering, label: "Ramen" })).toEqual({
        status: 403,
        body: { error: "FORBIDDEN" },
      });
      expect(await postJson(handler, "/api/tables/poll/vote", { session: deniedSession, gathering, option: "o1" })).toEqual({
        status: 403,
        body: { error: "FORBIDDEN" },
      });
      expect(await postJson(handler, "/api/tables/poll/unvote", { session: deniedSession, gathering })).toEqual({
        status: 403,
        body: { error: "FORBIDDEN" },
      });
      expect(await postJson(handler, "/api/tables/poll/remove", { session: deniedSession, gathering, option: "o1" })).toEqual({
        status: 403,
        body: { error: "FORBIDDEN" },
      });
      // ChooseVenue enforces NOT_HOST (404 NOT_FOUND) for any non-host
      expect(await postJson(handler, "/api/tables/poll/choose-venue", { session: deniedSession, gathering, option: "o1" })).toEqual({
        status: 404,
        body: { error: "NOT_FOUND" },
      });
    }

    // Seated guest1 cannot call ChooseVenue either (404 NOT_FOUND)
    expect(await postJson(handler, "/api/tables/poll/choose-venue", { session: guest1.session, gathering, option: "o1" })).toEqual({
      status: 404,
      body: { error: "NOT_FOUND" },
    });

    // Empty poll view for host and seated guest1: confirmedVenue is absent/null and votedOption is null
    const hostInitial = await postJson(handler, "/api/tables/poll", { session: host.session, gathering });
    expect(hostInitial.status).toBe(200);
    expect(hostInitial.body).toEqual({
      open: true,
      hosting: true,
      votedOption: null,
      options: [],
    });
    expect(hostInitial.body.confirmedVenue ?? null).toBeNull();

    const guestInitial = await postJson(handler, "/api/tables/poll", { session: guest1.session, gathering });
    expect(guestInitial.status).toBe(200);
    expect(guestInitial.body).toEqual({
      open: true,
      hosting: false,
      votedOption: null,
      options: [],
    });
    expect(guestInitial.body.confirmedVenue ?? null).toBeNull();

    // Cancelling the table makes all poll endpoints return TABLE_INACTIVE (409 CONFLICT) for host and seated guest1
    const cancelRes = await postJson(handler, "/gatherings/cancel", { session: host.session, gathering });
    expect(cancelRes.status).toBe(200);

    for (const viewerSession of [host.session, guest1.session]) {
      expect(await postJson(handler, "/api/tables/poll", { session: viewerSession, gathering })).toEqual({
        status: 409,
        body: { error: "CONFLICT" },
      });
      expect(await postJson(handler, "/api/tables/poll/add", { session: viewerSession, gathering, label: "Thai" })).toEqual({
        status: 409,
        body: { error: "CONFLICT" },
      });
      expect(await postJson(handler, "/api/tables/poll/vote", { session: viewerSession, gathering, option: "o1" })).toEqual({
        status: 409,
        body: { error: "CONFLICT" },
      });
      expect(await postJson(handler, "/api/tables/poll/unvote", { session: viewerSession, gathering })).toEqual({
        status: 409,
        body: { error: "CONFLICT" },
      });
      expect(await postJson(handler, "/api/tables/poll/remove", { session: viewerSession, gathering, option: "o1" })).toEqual({
        status: 409,
        body: { error: "CONFLICT" },
      });
    }
    expect(await postJson(handler, "/api/tables/poll/choose-venue", { session: host.session, gathering, option: "o1" })).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });
    // Non-host still sees NOT_HOST (404) on ChooseVenue even after cancellation
    expect(await postJson(handler, "/api/tables/poll/choose-venue", { session: guest1.session, gathering, option: "o1" })).toEqual({
      status: 404,
      body: { error: "NOT_FOUND" },
    });

    // CLOSED table also returns TABLE_INACTIVE (409 CONFLICT)
    const closedCreated = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Expired Table",
      area: "Central",
      ...futureTableTimes(),
      capacity: 2,
    });
    expect(closedCreated.status).toBe(200);
    const closedGathering = closedCreated.body.gathering as string;
    await new HostingConcept(db).expireUnconfirmed({
      gathering: closedGathering,
      now: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    expect(await postJson(handler, "/api/tables/poll", { session: host.session, gathering: closedGathering })).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });
  });

  test("supports adding, validating, deduplicating, capping at 20, voting, switching, unvoting, and authorized removal", async () => {
    const db = await testDatabase();
    const handler = createApplicationHttpHandler({ database: db });

    const host = await createUserSession(db, { externalId: "host", email: "host@mit.edu", name: "Host" });
    const guest1 = await createUserSession(db, { externalId: "guest1", email: "guest1@mit.edu", name: "Guest One" });
    const guest2 = await createUserSession(db, { externalId: "guest2", email: "guest2@mit.edu", name: "Guest Two" });

    const created = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Poll Flow Table",
      area: "Central Square",
      ...futureTableTimes(),
      capacity: 2,
    });
    expect(created.status).toBe(200);
    const { gathering, token } = created.body as { gathering: string; token: string };

    const otherTable = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Other Table",
      area: "Harvard Square",
      ...futureTableTimes(),
      capacity: 2,
    });
    expect(otherTable.status).toBe(200);
    const otherGathering = otherTable.body.gathering as string;

    await postJson(handler, "/api/tables/accept", { session: guest1.session, token });
    await postJson(handler, "/api/tables/accept", { session: guest2.session, token });

    // Invalid option labels refused with 400 INVALID_REQUEST
    for (const badLabel of ["", "   ", "a".repeat(101)]) {
      const res = await postJson(handler, "/api/tables/poll/add", {
        session: host.session,
        gathering,
        label: badLabel,
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "INVALID_REQUEST" });
    }

    // Host adds option 1, guest1 adds option 2
    const add1 = await postJson(handler, "/api/tables/poll/add", {
      session: host.session,
      gathering,
      label: "  Dumpling House  ",
    });
    expect(add1.status).toBe(200);
    const opt1 = add1.body.option as string;
    expect(typeof opt1).toBe("string");

    const add2 = await postJson(handler, "/api/tables/poll/add", {
      session: guest1.session,
      gathering,
      label: "Taco Spot",
    });
    expect(add2.status).toBe(200);
    const opt2 = add2.body.option as string;

    // Duplicate option (case-insensitive & trimmed) refused with 409 CONFLICT
    const dup = await postJson(handler, "/api/tables/poll/add", {
      session: guest2.session,
      gathering,
      label: "dumpling house",
    });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: "CONFLICT" });

    // Same label on a different table is allowed
    const otherOptRes = await postJson(handler, "/api/tables/poll/add", {
      session: host.session,
      gathering: otherGathering,
      label: "Dumpling House",
    });
    expect(otherOptRes.status).toBe(200);
    const otherOpt = otherOptRes.body.option as string;

    // Cross-table and missing option refused with 404 NOT_FOUND on vote, remove, and choose-venue
    for (const badOption of ["missing-option-id", otherOpt]) {
      expect(await postJson(handler, "/api/tables/poll/vote", { session: host.session, gathering, option: badOption })).toEqual({
        status: 404,
        body: { error: "NOT_FOUND" },
      });
      expect(await postJson(handler, "/api/tables/poll/remove", { session: host.session, gathering, option: badOption })).toEqual({
        status: 404,
        body: { error: "NOT_FOUND" },
      });
      expect(
        await postJson(handler, "/api/tables/poll/choose-venue", { session: host.session, gathering, option: badOption }),
      ).toEqual({
        status: 404,
        body: { error: "NOT_FOUND" },
      });
    }

    // Host and guests vote and switch votes
    expect(await postJson(handler, "/api/tables/poll/vote", { session: host.session, gathering, option: opt1 })).toEqual({
      status: 200,
      body: { voted: true },
    });
    expect(await postJson(handler, "/api/tables/poll/vote", { session: guest1.session, gathering, option: opt2 })).toEqual({
      status: 200,
      body: { voted: true },
    });
    expect(await postJson(handler, "/api/tables/poll/vote", { session: guest2.session, gathering, option: opt2 })).toEqual({
      status: 200,
      body: { voted: true },
    });
    // guest2 switches vote from opt2 to opt1
    expect(await postJson(handler, "/api/tables/poll/vote", { session: guest2.session, gathering, option: opt1 })).toEqual({
      status: 200,
      body: { voted: true },
    });

    const hostPoll = await postJson(handler, "/api/tables/poll", { session: host.session, gathering });
    expect(hostPoll.status).toBe(200);
    expect(hostPoll.body).toEqual({
      open: true,
      hosting: true,
      votedOption: opt1,
      options: [
        { option: opt1, label: "Dumpling House", voteCount: 2, canRemove: true },
        { option: opt2, label: "Taco Spot", voteCount: 1, canRemove: true },
      ],
    });
    expect(hostPoll.body.confirmedVenue ?? null).toBeNull();

    // guest2 sees canRemove: false on both options (proposed by host and guest1)
    const guest2Poll = await postJson(handler, "/api/tables/poll", { session: guest2.session, gathering });
    expect(guest2Poll.status).toBe(200);
    expect(guest2Poll.body).toEqual({
      open: true,
      hosting: false,
      votedOption: opt1,
      options: [
        { option: opt1, label: "Dumpling House", voteCount: 2, canRemove: false },
        { option: opt2, label: "Taco Spot", voteCount: 1, canRemove: false },
      ],
    });
    expect(guest2Poll.body.confirmedVenue ?? null).toBeNull();

    // guest1 sees canRemove: true only on opt2 (proposed by guest1)
    const guest1Poll = await postJson(handler, "/api/tables/poll", { session: guest1.session, gathering });
    expect(guest1Poll.status).toBe(200);
    expect(guest1Poll.body.options).toEqual([
      { option: opt1, label: "Dumpling House", voteCount: 2, canRemove: false },
      { option: opt2, label: "Taco Spot", voteCount: 1, canRemove: true },
    ]);

    // guest2 unvotes (and idempotent second unvote succeeds)
    expect(await postJson(handler, "/api/tables/poll/unvote", { session: guest2.session, gathering })).toEqual({
      status: 200,
      body: { cleared: true },
    });
    expect(await postJson(handler, "/api/tables/poll/unvote", { session: guest2.session, gathering })).toEqual({
      status: 200,
      body: { cleared: true },
    });
    const afterUnvote = await postJson(handler, "/api/tables/poll", { session: guest2.session, gathering });
    expect(afterUnvote.body.votedOption).toBeNull();
    expect(afterUnvote.body.options[0].voteCount).toBe(1);

    // guest2 cannot remove guest1's option (403 FORBIDDEN) or host's option (403 FORBIDDEN)
    expect(await postJson(handler, "/api/tables/poll/remove", { session: guest2.session, gathering, option: opt2 })).toEqual({
      status: 403,
      body: { error: "FORBIDDEN" },
    });
    expect(await postJson(handler, "/api/tables/poll/remove", { session: guest2.session, gathering, option: opt1 })).toEqual({
      status: 403,
      body: { error: "FORBIDDEN" },
    });

    // guest1 CAN remove guest1's own option (opt2), which also clears guest1's vote for opt2
    expect(await postJson(handler, "/api/tables/poll/remove", { session: guest1.session, gathering, option: opt2 })).toEqual({
      status: 200,
      body: { removed: true },
    });
    const guest1AfterRemove = await postJson(handler, "/api/tables/poll", { session: guest1.session, gathering });
    expect(guest1AfterRemove.body.votedOption).toBeNull();
    expect(guest1AfterRemove.body.options).toHaveLength(1);

    // Host CAN remove a guest-proposed option
    const add3 = await postJson(handler, "/api/tables/poll/add", {
      session: guest2.session,
      gathering,
      label: "Noodle Lab",
    });
    expect(add3.status).toBe(200);
    expect(
      await postJson(handler, "/api/tables/poll/remove", {
        session: host.session,
        gathering,
        option: add3.body.option,
      }),
    ).toEqual({ status: 200, body: { removed: true } });

    // Confirming the table without confirmedVenue keeps the poll open
    const confirmRes = await postJson(handler, "/gatherings/confirm", { session: host.session, gathering });
    expect(confirmRes.status).toBe(200);

    // Fill up to 20 options total (1 already exists: opt1), then 21st hits OPTION_LIMIT_REACHED (409 CONFLICT)
    for (let i = 2; i <= 20; i++) {
      const added = await postJson(handler, "/api/tables/poll/add", {
        session: host.session,
        gathering,
        label: `Place ${i}`,
      });
      expect(added.status).toBe(200);
    }
    const overLimit = await postJson(handler, "/api/tables/poll/add", {
      session: host.session,
      gathering,
      label: "Place 21",
    });
    expect(overLimit.status).toBe(409);
    expect(overLimit.body).toEqual({ error: "CONFLICT" });
  });

  test("ChooseVenue sets confirmedVenue, closes poll, and BOOKED / initial confirmedVenue tables reject edits with POLL_CLOSED", async () => {
    const db = await testDatabase();
    const handler = createApplicationHttpHandler({ database: db });

    const host = await createUserSession(db, { externalId: "host", email: "host@mit.edu", name: "Host" });
    const guest1 = await createUserSession(db, { externalId: "guest1", email: "guest1@mit.edu", name: "Guest One" });
    const outsider = await createUserSession(db, { externalId: "outsider", email: "outsider@mit.edu", name: "Outsider" });

    // 1. Table created with no venue -> host chooses a poll option as confirmedVenue
    const created = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Venue Pick Dinner",
      area: "Harvard Square",
      ...futureTableTimes(),
      capacity: 2,
    });
    expect(created.status).toBe(200);
    const { gathering, token } = created.body as { gathering: string; token: string };

    await postJson(handler, "/api/tables/accept", { session: guest1.session, token });

    const addRes = await postJson(handler, "/api/tables/poll/add", {
      session: guest1.session,
      gathering,
      label: "Alden & Harlow",
    });
    const opt = addRes.body.option as string;

    const chosen = await postJson(handler, "/api/tables/poll/choose-venue", {
      session: host.session,
      gathering,
      option: opt,
    });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toEqual({ confirmedVenue: "Alden & Harlow" });

    // ViewTable and ViewPoll both reflect confirmedVenue, and ViewPoll reports open: false
    const tableView = await postJson(handler, "/api/tables/view", { token });
    expect(tableView.status).toBe(200);
    expect(tableView.body.confirmedVenue).toBe("Alden & Harlow");

    const pollAfterChoose = await postJson(handler, "/api/tables/poll", { session: guest1.session, gathering });
    expect(pollAfterChoose.status).toBe(200);
    expect(pollAfterChoose.body).toEqual({
      open: false,
      confirmedVenue: "Alden & Harlow",
      hosting: false,
      votedOption: null,
      options: [{ option: opt, label: "Alden & Harlow", voteCount: 0, canRemove: true }],
    });

    // Subsequent edits, votes, unvotes, removals, and ChooseVenue return POLL_CLOSED (409 CONFLICT)
    expect(await postJson(handler, "/api/tables/poll/add", { session: host.session, gathering, label: "Another" })).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });
    expect(await postJson(handler, "/api/tables/poll/vote", { session: guest1.session, gathering, option: opt })).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });
    expect(await postJson(handler, "/api/tables/poll/unvote", { session: guest1.session, gathering })).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });
    expect(await postJson(handler, "/api/tables/poll/remove", { session: host.session, gathering, option: opt })).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });
    expect(
      await postJson(handler, "/api/tables/poll/choose-venue", { session: host.session, gathering, option: opt }),
    ).toEqual({
      status: 409,
      body: { error: "CONFLICT" },
    });

    // Outsider still gets NOT_PARTICIPANT (403) rather than POLL_CLOSED
    expect(await postJson(handler, "/api/tables/poll/add", { session: outsider.session, gathering, label: "X" })).toEqual({
      status: 403,
      body: { error: "FORBIDDEN" },
    });

    // Host can now confirm and markBooked
    expect((await postJson(handler, "/gatherings/confirm", { session: host.session, gathering })).status).toBe(200);
    expect((await postJson(handler, "/gatherings/book", { session: host.session, gathering })).status).toBe(200);

    const pollWhenBooked = await postJson(handler, "/api/tables/poll", { session: host.session, gathering });
    expect(pollWhenBooked.status).toBe(200);
    expect(pollWhenBooked.body.open).toBe(false);

    // 2. Table created with initial confirmedVenue has open: false immediately
    const preVenueTable = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Already Picked",
      area: "Back Bay",
      ...futureTableTimes(),
      confirmedVenue: "Saltie Girl",
      capacity: 2,
    });
    expect(preVenueTable.status).toBe(200);
    const preGathering = preVenueTable.body.gathering as string;

    const prePoll = await postJson(handler, "/api/tables/poll", { session: host.session, gathering: preGathering });
    expect(prePoll.status).toBe(200);
    expect(prePoll.body).toEqual({
      open: false,
      confirmedVenue: "Saltie Girl",
      hosting: true,
      votedOption: null,
      options: [],
    });

    expect(
      await postJson(handler, "/api/tables/poll/add", {
        session: host.session,
        gathering: preGathering,
        label: "New Spot",
      }),
    ).toEqual({ status: 409, body: { error: "CONFLICT" } });
  });

  test("withdrawing from a seated reservation clears the guest's poll vote and promotes waitlisted guest", async () => {
    const db = await testDatabase();
    const handler = createApplicationHttpHandler({ database: db });

    const host = await createUserSession(db, { externalId: "host", email: "host@mit.edu", name: "Host" });
    const guest1 = await createUserSession(db, { externalId: "guest1", email: "guest1@mit.edu", name: "Guest One" });
    const guest2 = await createUserSession(db, { externalId: "guest2", email: "guest2@mit.edu", name: "Guest Two" });

    const created = await postJson(handler, "/api/tables/create", {
      session: host.session,
      title: "Withdrawal Cleanup Table",
      area: "Cambridge",
      ...futureTableTimes(),
      capacity: 1,
    });
    expect(created.status).toBe(200);
    const { gathering, token } = created.body as { gathering: string; token: string };

    // guest1 gets the seat, guest2 is waitlisted
    await postJson(handler, "/api/tables/accept", { session: guest1.session, token });
    await postJson(handler, "/api/tables/accept", { session: guest2.session, token });

    const add1 = await postJson(handler, "/api/tables/poll/add", {
      session: guest1.session,
      gathering,
      label: "Siam Ginger",
    });
    const opt1 = add1.body.option as string;

    // Both host and guest1 vote for opt1 -> voteCount = 2
    await postJson(handler, "/api/tables/poll/vote", { session: host.session, gathering, option: opt1 });
    await postJson(handler, "/api/tables/poll/vote", { session: guest1.session, gathering, option: opt1 });

    const beforeWithdraw = await postJson(handler, "/api/tables/poll", { session: host.session, gathering });
    expect(beforeWithdraw.body.options[0].voteCount).toBe(2);

    // guest1 withdraws -> Reserving.cancel promotes guest2 and ClearVoteOnSeatCancel clears guest1's vote
    const withdraw = await postJson(handler, "/api/tables/withdraw", { session: guest1.session, gathering });
    expect(withdraw.status).toBe(200);
    expect(withdraw.body).toEqual({ withdrawn: true });

    // guest1 immediately loses poll access
    expect(await postJson(handler, "/api/tables/poll", { session: guest1.session, gathering })).toEqual({
      status: 403,
      body: { error: "FORBIDDEN" },
    });

    // Promoted guest2 gains poll access and sees voteCount dropped to 1 (host's vote only)
    const afterWithdraw = await postJson(handler, "/api/tables/poll", { session: guest2.session, gathering });
    expect(afterWithdraw.status).toBe(200);
    expect(afterWithdraw.body).toEqual({
      open: true,
      hosting: false,
      votedOption: null,
      options: [{ option: opt1, label: "Siam Ginger", voteCount: 1, canRemove: false }],
    });
    expect(afterWithdraw.body.confirmedVenue ?? null).toBeNull();
  });
});
