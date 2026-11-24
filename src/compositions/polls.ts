import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, form, former, is, no, reaction, when, where, whether } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const { Hosting, Polling, Reserving, Sessioning } = concepts;

type EndpointVars = Parameters<Parameters<typeof endpoint>[1]>[0];
type PollGuardVars = Pick<
  EndpointVars,
  "gathering" | "viewer" | "host" | "status" | "active" | "hosting" | "reserved" | "confirmedVenue" | "pollOpen"
>;

/** Every option in a gathering's poll, oldest first, with vote counts and viewer removal permission. */
const PollOptions = former(
  "the poll options",
  ({ gathering, hosting, viewer }, { option, label, proposedBy, voteCount, canRemove }) =>
    each(Polling._listOptions({ scope: gathering }).is({ option, label, proposedBy }))
      .where(
        Polling._getVoteCount({ option }).is({ voteCount }),
        compute(computations.canRemovePollOption, { hosting, proposedBy, viewer }, canRemove),
      )
      .form({ option, label, voteCount, canRemove }),
);

/** Mutually exclusive participant-access and open-poll guard branches for poll-editing endpoints. */
function editablePollBranches(
  { gathering, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen }: PollGuardVars,
  onOpen: (checks: ReturnType<typeof where>) => ReturnType<ReturnType<typeof where>["then"]>,
) {

  const activeHostBase = [
    Hosting._getDetails({ gathering }).is({ status, host }),
    compute(computations.isActiveTableStatus, { status }, active),
    is.among(active, [true]),
    compute(computations.matchesUser, { a: host, b: viewer }, hosting),
    is.among(hosting, [true]),
    whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
  ] as const;

  const activeSeatedBase = [
    Hosting._getDetails({ gathering }).is({ status, host }),
    compute(computations.isActiveTableStatus, { status }, active),
    is.among(active, [true]),
    compute(computations.matchesUser, { a: host, b: viewer }, hosting),
    is.among(hosting, [false]),
    Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
    is.among(reserved, [true]),
    whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
  ] as const;

  return [
    where(no(Hosting._getDetails({ gathering })))
      .then(respond({ error: "NO_SUCH_TABLE" }))
      .named("no-such-table"),
    where(
      Hosting._getDetails({ gathering }).is({ status }),
      compute(computations.isActiveTableStatus, { status }, active),
      is.among(active, [false]),
    )
      .then(respond({ error: "TABLE_INACTIVE" }))
      .named("table-inactive"),
    where(
      Hosting._getDetails({ gathering }).is({ status, host }),
      compute(computations.isActiveTableStatus, { status }, active),
      is.among(active, [true]),
      compute(computations.matchesUser, { a: host, b: viewer }, hosting),
      is.among(hosting, [false]),
      Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
      is.among(reserved, [false]),
    )
      .then(respond({ error: "NOT_PARTICIPANT" }))
      .named("not-participant"),
    where(...activeHostBase, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [false]))
      .then(respond({ error: "POLL_CLOSED" }))
      .named("poll-closed-host"),
    where(...activeSeatedBase, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [false]))
      .then(respond({ error: "POLL_CLOSED" }))
      .named("poll-closed-seated"),
    onOpen(
      where(...activeHostBase, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [true])),
    ).named("host-open"),
    onOpen(
      where(...activeSeatedBase, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [true])),
    ).named("seated-open"),
  ] as const;
}

const ViewPoll = endpoint(
  "/api/tables/poll",
  ({ session, gathering, now, viewer, host, status, active, hosting, reserved, confirmedVenue, open, votedOption }) => {
    const respondView = (checks: ReturnType<typeof where>) =>
      checks.then(
        respond({
          open,
          confirmedVenue,
          hosting,
          votedOption,
          options: PollOptions({ gathering, hosting, viewer }),
        }),
      );

    return receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        where(no(Hosting._getDetails({ gathering })))
          .then(respond({ error: "NO_SUCH_TABLE" }))
          .named("no-such-table"),
        where(
          Hosting._getDetails({ gathering }).is({ status }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [false]),
        )
          .then(respond({ error: "TABLE_INACTIVE" }))
          .named("table-inactive"),
        where(
          Hosting._getDetails({ gathering }).is({ status, host }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [true]),
          compute(computations.matchesUser, { a: host, b: viewer }, hosting),
          is.among(hosting, [false]),
          Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
          is.among(reserved, [false]),
        )
          .then(respond({ error: "NOT_PARTICIPANT" }))
          .named("not-participant"),
        respondView(
          where(
            Hosting._getDetails({ gathering }).is({ status, host }),
            compute(computations.isActiveTableStatus, { status }, active),
            is.among(active, [true]),
            compute(computations.matchesUser, { a: host, b: viewer }, hosting),
            is.among(hosting, [true]),
            whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
            compute(computations.isPollOpen, { status, confirmedVenue }, open),
            whether(Polling._getVote({ scope: gathering, voter: viewer }).is({ option: votedOption })),
          ),
        ).named("host-viewer"),
        respondView(
          where(
            Hosting._getDetails({ gathering }).is({ status, host }),
            compute(computations.isActiveTableStatus, { status }, active),
            is.among(active, [true]),
            compute(computations.matchesUser, { a: host, b: viewer }, hosting),
            is.among(hosting, [false]),
            Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
            is.among(reserved, [true]),
            whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
            compute(computations.isPollOpen, { status, confirmedVenue }, open),
            whether(Polling._getVote({ scope: gathering, voter: viewer }).is({ option: votedOption })),
          ),
        ).named("seated-viewer"),
      );
  },
  { input: { required: ["session", "gathering"] } },
);

const AddOption = endpoint(
  "/api/tables/poll/add",
  ({ session, gathering, label, now, viewer, option, host, status, active, hosting, reserved, confirmedVenue, pollOpen }) =>
    receive({ session, gathering, label })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        ...editablePollBranches(
          { gathering, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen },
          (checks) =>
            checks.then(Polling.addOption({ scope: gathering, label, proposedBy: viewer, now }).responds({ option })).then(respond({ option })),
        ),
      ),
  { input: { required: ["session", "gathering", "label"] } },
);

const VoteOption = endpoint(
  "/api/tables/poll/vote",
  ({ session, gathering, option, now, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen }) =>
    receive({ session, gathering, option })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        ...editablePollBranches(
          { gathering, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen },
          (checks) => checks.then(Polling.castVote({ scope: gathering, option, voter: viewer })).then(respond({ voted: true })),
        ),
      ),
  { input: { required: ["session", "gathering", "option"] } },
);

const ClearVote = endpoint(
  "/api/tables/poll/unvote",
  ({ session, gathering, now, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        ...editablePollBranches(
          { gathering, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen },
          (checks) => checks.then(Polling.clearVote({ scope: gathering, voter: viewer })).then(respond({ cleared: true })),
        ),
      ),
  { input: { required: ["session", "gathering"] } },
);

const RemoveOption = endpoint(
  "/api/tables/poll/remove",
  ({ session, gathering, option, now, viewer, host, status, active, hosting, reserved, confirmedVenue, pollOpen, proposedBy, canRemove }) => {
    const activeHostBase = [
      Hosting._getDetails({ gathering }).is({ status, host }),
      compute(computations.isActiveTableStatus, { status }, active),
      is.among(active, [true]),
      compute(computations.matchesUser, { a: host, b: viewer }, hosting),
      is.among(hosting, [true]),
      whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
    ] as const;

    const activeSeatedBase = [
      Hosting._getDetails({ gathering }).is({ status, host }),
      compute(computations.isActiveTableStatus, { status }, active),
      is.among(active, [true]),
      compute(computations.matchesUser, { a: host, b: viewer }, hosting),
      is.among(hosting, [false]),
      Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
      is.among(reserved, [true]),
      whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
    ] as const;

    return receive({ session, gathering, option })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        where(no(Hosting._getDetails({ gathering })))
          .then(respond({ error: "NO_SUCH_TABLE" }))
          .named("no-such-table"),
        where(
          Hosting._getDetails({ gathering }).is({ status }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [false]),
        )
          .then(respond({ error: "TABLE_INACTIVE" }))
          .named("table-inactive"),
        where(
          Hosting._getDetails({ gathering }).is({ status, host }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [true]),
          compute(computations.matchesUser, { a: host, b: viewer }, hosting),
          is.among(hosting, [false]),
          Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
          is.among(reserved, [false]),
        )
          .then(respond({ error: "NOT_PARTICIPANT" }))
          .named("not-participant"),
        where(...activeHostBase, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [false]))
          .then(respond({ error: "POLL_CLOSED" }))
          .named("poll-closed-host"),
        where(...activeSeatedBase, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [false]))
          .then(respond({ error: "POLL_CLOSED" }))
          .named("poll-closed-seated"),
        where(
          ...activeHostBase,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          no(Polling._getOption({ option }).is({ scope: gathering })),
        )
          .then(respond({ error: "NO_SUCH_OPTION" }))
          .named("no-such-option-host"),
        where(
          ...activeSeatedBase,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          no(Polling._getOption({ option }).is({ scope: gathering })),
        )
          .then(respond({ error: "NO_SUCH_OPTION" }))
          .named("no-such-option-seated"),
        where(
          ...activeSeatedBase,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          Polling._getOption({ option }).is({ scope: gathering, proposedBy }),
          compute(computations.canRemovePollOption, { hosting, proposedBy, viewer }, canRemove),
          is.among(canRemove, [false]),
        )
          .then(respond({ error: "NOT_AUTHORIZED" }))
          .named("not-authorized"),
        where(
          ...activeHostBase,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          Polling._getOption({ option }).is({ scope: gathering, proposedBy }),
          compute(computations.canRemovePollOption, { hosting, proposedBy, viewer }, canRemove),
          is.among(canRemove, [true]),
        )
          .then(Polling.removeOption({ scope: gathering, option }))
          .then(respond({ removed: true }))
          .named("remove-host"),
        where(
          ...activeSeatedBase,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          Polling._getOption({ option }).is({ scope: gathering, proposedBy }),
          compute(computations.canRemovePollOption, { hosting, proposedBy, viewer }, canRemove),
          is.among(canRemove, [true]),
        )
          .then(Polling.removeOption({ scope: gathering, option }))
          .then(respond({ removed: true }))
          .named("remove-seated"),
      );
  },
  { input: { required: ["session", "gathering", "option"] } },
);

const ChooseVenue = endpoint(
  "/api/tables/poll/choose-venue",
  ({ session, gathering, option, now, viewer, host, hosting, status, active, confirmedVenue, pollOpen, label }) => {
    const hostActiveChecks = [
      Hosting._getDetails({ gathering }).is({ host, status }),
      compute(computations.matchesUser, { a: host, b: viewer }, hosting),
      is.among(hosting, [true]),
      compute(computations.isActiveTableStatus, { status }, active),
      is.among(active, [true]),
      whether(Hosting._getDetails({ gathering }).is({ confirmedVenue })),
    ] as const;

    return receive({ session, gathering, option })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        where(no(Hosting._getDetails({ gathering })))
          .then(respond({ error: "NO_SUCH_TABLE" }))
          .named("no-such-table"),
        where(
          Hosting._getDetails({ gathering }).is({ host }),
          compute(computations.matchesUser, { a: host, b: viewer }, hosting),
          is.among(hosting, [false]),
        )
          .then(respond({ error: "NOT_HOST" }))
          .named("not-host"),
        where(
          Hosting._getDetails({ gathering }).is({ host, status }),
          compute(computations.matchesUser, { a: host, b: viewer }, hosting),
          is.among(hosting, [true]),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [false]),
        )
          .then(respond({ error: "TABLE_INACTIVE" }))
          .named("table-inactive"),
        where(...hostActiveChecks, compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen), is.among(pollOpen, [false]))
          .then(respond({ error: "POLL_CLOSED" }))
          .named("poll-closed"),
        where(
          ...hostActiveChecks,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          no(Polling._getOption({ option }).is({ scope: gathering })),
        )
          .then(respond({ error: "NO_SUCH_OPTION" }))
          .named("no-such-option"),
        where(
          ...hostActiveChecks,
          compute(computations.isPollOpen, { status, confirmedVenue }, pollOpen),
          is.among(pollOpen, [true]),
          Polling._getOption({ option }).is({ scope: gathering, label }),
        )
          .then(Hosting.setVenue({ gathering, confirmedVenue: label }))
          .then(respond({ confirmedVenue: label }))
          .named("choose-venue"),
      );
  },
  { input: { required: ["session", "gathering", "option"] } },
);

const ClearVoteOnSeatCancel = reaction(({ gathering, user }) =>
  when(Reserving.cancel({}).responds({ resource: gathering, user })).then(
    Polling.clearVote({ scope: gathering, voter: user }),
  ),
);

export const pollsComposition = {
  Viewing: { ViewPoll, PollOptions },
  Editing: { AddOption, RemoveOption },
  Voting: { VoteOption, ClearVote },
  Venue: { ChooseVenue },
  Clearing: { ClearVoteOnSeatCancel },
};
