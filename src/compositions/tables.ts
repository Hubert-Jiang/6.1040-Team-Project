import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, form, former, is, no, where, whether } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const { Authenticating, Hosting, Inviting, Linking, Reserving, Sessioning } = concepts;

/** Every gathering a host has made, latest start first. */
const HostedTables = former("the host's tables", ({ host }, { gathering, title, status, startTime }) =>
  form({
    tables: each(Hosting._getHosted({ host }).is({ gathering, title, status, startTime })).form({
      gathering,
      title,
      status,
      startTime,
    }),
  }),
);

/** Every link to a gathering, active ones first. */
const TableLinks = former("a table's links", ({ gathering }, { link, token, label, active, expiresAt }) =>
  form({
    links: each(Linking._listForTarget({ target: gathering }).is({ link, token, label, active, expiresAt })).form({
      link,
      token,
      label,
      active,
      expiresAt,
    }),
  }),
);

/** Where a guest stands at a table: their reservation if seated, their 1-based waitlist position if waiting, each blank otherwise. */
const GuestPlace = former("a guest's place at a table", ({ gathering, guest }, { reservation, position }) =>
  where(
    whether(Reserving._getReservation({ resource: gathering, user: guest }).is({ reservation })),
    whether(Reserving._getWaitlistPosition({ resource: gathering, user: guest }).is({ position })),
  ).form({ reservation, position }),
);

const CreateTable = endpoint(
  "/api/tables/create",
  ({
    session,
    title,
    area,
    startTime,
    endTime,
    cutoffTime,
    details,
    scope,
    confirmedVenue,
    capacity,
    linkLabel,
    now,
    host,
    start,
    end,
    cutoff,
    capacityOk,
    scoped,
    matches,
    gathering,
    link,
    token,
  }) => {
    // the time inputs arrive as ISO strings; an unreadable one becomes an invalid date that Hosting refuses
    const parseTimes = [
      compute(computations.parseTime, { raw: startTime }, start),
      compute(computations.parseTime, { raw: endTime }, end),
      compute(computations.parseTime, { raw: cutoffTime }, cutoff),
    ] as const;

    // the same steps run whether or not the table has a domain scope, so they are written once here
    const createAndShare = (checks: ReturnType<typeof where>) =>
      checks
        .then(
          Hosting.create({
            host,
            title,
            startTime: start,
            endTime: end,
            cutoffTime: cutoff,
            details,
            scope,
            area,
            confirmedVenue,
            now,
          }).responds({ gathering }),
        )
        .then(Reserving.openPool({ resource: gathering, capacity }))
        .then(Linking.createLink({ target: gathering, creator: host, label: linkLabel, now }).responds({ link, token }))
        .then(respond({ gathering, link, token }));

    return receive({ session, title, area, startTime, endTime, cutoffTime, details, scope, confirmedVenue, capacity, linkLabel })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: host })))
      .then(
        // capacity is checked before Hosting.create, so a bad capacity never leaves a table without a pool
        where(compute(computations.isValidCapacity, { capacity }, capacityOk), is.among(capacityOk, [false]))
          .then(respond({ error: "INVALID_CAPACITY" }))
          .named("invalid-capacity"),
        createAndShare(
          where(
            compute(computations.isValidCapacity, { capacity }, capacityOk),
            is.among(capacityOk, [true]),
            compute(computations.hasText, { value: scope }, scoped),
            is.among(scoped, [false]),
            ...parseTimes,
          ),
        ).named("open-to-anyone"),
        createAndShare(
          where(
            compute(computations.isValidCapacity, { capacity }, capacityOk),
            is.among(capacityOk, [true]),
            compute(computations.hasText, { value: scope }, scoped),
            is.among(scoped, [true]),
            Authenticating._hasDomain({ user: host, domain: scope }).is({ matches }),
            is.among(matches, [true]),
            ...parseTimes,
          ),
        ).named("host-in-scope"),
        where(
          compute(computations.isValidCapacity, { capacity }, capacityOk),
          is.among(capacityOk, [true]),
          compute(computations.hasText, { value: scope }, scoped),
          is.among(scoped, [true]),
          Authenticating._hasDomain({ user: host, domain: scope }).is({ matches }),
          is.among(matches, [false]),
        )
          .then(respond({ error: "SCOPE_MISMATCH" }))
          .named("host-out-of-scope"),
      );
  },
  {
    input: {
      required: ["session", "title", "area", "startTime", "endTime", "cutoffTime", "capacity"],
      defaults: { details: null, scope: null, confirmedVenue: null, linkLabel: null },
    },
  },
);

const ViewTable = endpoint(
  "/api/tables/view",
  ({
    token,
    now,
    gathering,
    title,
    status,
    startTime,
    endTime,
    cutoffTime,
    details,
    scope,
    area,
    confirmedVenue,
    capacity,
    reservedCount,
    remaining,
    waitlistCount,
    locked,
  }) =>
    receive({ token }).then(
      where(
        compute(computations.now, {}, now),
        Linking._resolve({ token, now }).is({ target: gathering }),
        Hosting._getDetails({ gathering }).is({
          title,
          status,
          startTime,
          endTime,
          cutoffTime,
          details,
          scope,
          area,
          confirmedVenue,
        }),
        Reserving._getAvailability({ resource: gathering }).is({ capacity, reservedCount, remaining, waitlistCount, locked }),
      )
        .then(
          respond({
            gathering,
            title,
            status,
            startTime,
            endTime,
            cutoffTime,
            details,
            scope,
            area,
            confirmedVenue,
            capacity,
            reservedCount,
            remaining,
            waitlistCount,
            locked,
          }),
        )
        .named("link-active"),
      where(compute(computations.now, {}, now), no(Linking._resolve({ token, now })))
        .then(respond({ error: "LINK_NOT_FOUND" }))
        .named("link-unknown"),
    ),
  { input: { required: ["token"] } },
);

const MyTables = endpoint(
  "/api/tables/mine",
  ({ session, now, host }) =>
    receive({ session })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: host })))
      .then(respond({ hosted: HostedTables({ host }) })),
  { input: { required: ["session"] } },
);

const CreateLink = endpoint(
  "/api/links/create",
  ({ session, gathering, label, now, host, link, token }) =>
    receive({ session, gathering, label })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: host })))
      .then(
        where(Hosting._getDetails({ gathering }).is({ host }))
          .then(Linking.createLink({ target: gathering, creator: host, label, now }).responds({ link, token }))
          .then(respond({ link, token }))
          .named("is-host"),
        where(no(Hosting._getDetails({ gathering }).is({ host })))
          .then(respond({ error: "NOT_HOST" }))
          .named("not-host"),
      ),
  { input: { required: ["session", "gathering"], defaults: { label: null } } },
);

const ListLinks = endpoint(
  "/api/links/list",
  ({ session, gathering, now, host }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: host })))
      .then(
        where(Hosting._getDetails({ gathering }).is({ host }))
          .then(respond({ shared: TableLinks({ gathering }) }))
          .named("is-host"),
        where(no(Hosting._getDetails({ gathering }).is({ host })))
          .then(respond({ error: "NOT_HOST" }))
          .named("not-host"),
      ),
  { input: { required: ["session", "gathering"] } },
);

const RevokeLink = endpoint(
  "/api/links/revoke",
  ({ session, link, now, host }) =>
    receive({ session, link })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: host })))
      .then(Linking.revokeLink({ link, creator: host }))
      .then(respond({ revoked: true })),
  { input: { required: ["session", "link"] } },
);

const ActivateLink = endpoint(
  "/api/links/activate",
  ({ session, link, now, host }) =>
    receive({ session, link })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: host })))
      .then(Linking.activateLink({ link, creator: host }))
      .then(respond({ activated: true })),
  { input: { required: ["session", "link"] } },
);

const AcceptTable = endpoint(
  "/api/tables/accept",
  ({ session, token, now, guest, gathering, status, cutoffTime, scope, locked, accepting, scoped, matches }) => {
    // the link is live, the guest is not the host, and the table still takes guests: open or confirmed, unlocked, before its cutoff
    const tableFor = (open: boolean) =>
      [
        Linking._resolve({ token, now }).is({ target: gathering }),
        no(Hosting._getDetails({ gathering }).is({ host: guest })),
        Hosting._getDetails({ gathering }).is({ status, cutoffTime }),
        Reserving._getAvailability({ resource: gathering }).is({ locked }),
        compute(computations.isAcceptingGuests, { status, locked, cutoffTime, now }, accepting),
        is.among(accepting, [open]),
      ] as const;

    // claim picks a seat or the waitlist in one atomic step, so the guest always ends up with exactly one of the two
    const acceptAndClaim = (checks: ReturnType<typeof where>) =>
      checks
        .then(Inviting.accept({ event: gathering, guest }))
        .then(Reserving.claim({ resource: gathering, user: guest }))
        // claim answers only one of its two outputs, so the answer reads the guest's place back instead of binding them
        .then(respond({ gathering, place: GuestPlace({ gathering, guest }) }));

    return receive({ session, token })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: guest })))
      .then(
        where(no(Linking._resolve({ token, now })))
          .then(respond({ error: "LINK_NOT_FOUND" }))
          .named("link-unknown"),
        where(Linking._resolve({ token, now }).is({ target: gathering }), Hosting._getDetails({ gathering }).is({ host: guest }))
          .then(respond({ error: "OWN_TABLE" }))
          .named("own-table"),
        where(...tableFor(false))
          .then(respond({ error: "TABLE_CLOSED" }))
          .named("table-closed"),
        acceptAndClaim(
          where(...tableFor(true), Hosting._getDetails({ gathering }).is({ scope }), compute(computations.hasText, { value: scope }, scoped), is.among(scoped, [false])),
        ).named("open-to-anyone"),
        acceptAndClaim(
          where(
            ...tableFor(true),
            Hosting._getDetails({ gathering }).is({ scope }),
            compute(computations.hasText, { value: scope }, scoped),
            is.among(scoped, [true]),
            Authenticating._hasDomain({ user: guest, domain: scope }).is({ matches }),
            is.among(matches, [true]),
          ),
        ).named("guest-in-scope"),
        where(
          ...tableFor(true),
          Hosting._getDetails({ gathering }).is({ scope }),
          compute(computations.hasText, { value: scope }, scoped),
          is.among(scoped, [true]),
          Authenticating._hasDomain({ user: guest, domain: scope }).is({ matches }),
          is.among(matches, [false]),
        )
          .then(respond({ error: "SCOPE_MISMATCH" }))
          .named("guest-out-of-scope"),
      );
  },
  { input: { required: ["session", "token"] } },
);

const WithdrawTable = endpoint(
  "/api/tables/withdraw",
  ({ session, gathering, now, guest, reservation, locked }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: guest })))
      .then(
        // the seat goes first: cancel refuses once seats are locked, before the acceptance is touched, and hands the seat to the first waiting guest
        where(Reserving._getReservation({ resource: gathering, user: guest }).is({ reservation }))
          .then(Reserving.cancel({ reservation }))
          .then(Inviting.withdraw({ event: gathering, guest }))
          .then(respond({ withdrawn: true }))
          .named("seated"),
        where(
          Reserving._getWaitlistPosition({ resource: gathering, user: guest }),
          Reserving._getAvailability({ resource: gathering }).is({ locked }),
          is.among(locked, [false]),
        )
          .then(Reserving.leaveWaitlist({ resource: gathering, user: guest }))
          .then(Inviting.withdraw({ event: gathering, guest }))
          .then(respond({ withdrawn: true }))
          .named("waitlisted"),
        where(
          Reserving._getWaitlistPosition({ resource: gathering, user: guest }),
          Reserving._getAvailability({ resource: gathering }).is({ locked }),
          is.among(locked, [true]),
        )
          .then(respond({ error: "TABLE_CLOSED" }))
          .named("waitlist-locked"),
        // holding neither, so Inviting.withdraw refuses NOT_ACCEPTED unless an acceptance is somehow left over
        where(no(Reserving._getReservation({ resource: gathering, user: guest })), no(Reserving._getWaitlistPosition({ resource: gathering, user: guest })))
          .then(Inviting.withdraw({ event: gathering, guest }))
          .then(respond({ withdrawn: true }))
          .named("holding-nothing"),
      ),
  { input: { required: ["session", "gathering"] } },
);

const MyPlace = endpoint(
  "/api/tables/place",
  ({ session, gathering, now, viewer }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        where(Hosting._getDetails({ gathering }).is({ host: viewer }))
          .then(respond({ hosting: true, place: GuestPlace({ gathering, guest: viewer }) }))
          .named("host"),
        where(no(Hosting._getDetails({ gathering }).is({ host: viewer })))
          .then(respond({ hosting: false, place: GuestPlace({ gathering, guest: viewer }) }))
          .named("not-host"),
      ),
  { input: { required: ["session", "gathering"] } },
);

export const tablesComposition = {
  Hosting: { CreateTable, MyTables, HostedTables },
  Viewing: { ViewTable },
  Joining: { AcceptTable, WithdrawTable, GuestPlace, MyPlace },
  Sharing: { CreateLink, ListLinks, RevokeLink, ActivateLink, TableLinks },
};
