# Polls

## Viewing a table's poll

A signed-in participant [views a table's poll](reaction:Polls.Viewing.ViewPoll) by sending their `session` and `gathering`. Binding [current time](computation:now) (from the shared `now() : DateTime` computation declared in `design/compositions/Auth.md`), `Sessioning.current` resolves the caller to `viewer` (refusing `UNKNOWN_SESSION` when inactive, so requests never assert identity). The endpoint reads `Hosting._getDetails` for `gathering`; when no gathering exists, it refuses `NO_SUCH_TABLE`. It then checks `status` with [active table check](computation:isActiveTableStatus) (declared in `design/compositions/Profiles.md`), refusing `TABLE_INACTIVE` once the gathering is `CLOSED` or `CANCELLED`. While `OPEN`, `CONFIRMED`, or `BOOKED`, [user equality](computation:matchesUser) determines whether `viewer` is the gathering's `host` (`hosting`); when `hosting` is false, `Reserving._hasReservation` must return `reserved: true`, so non-seated and waitlisted-only users are refused `NOT_PARTICIPANT`.

For an authorized viewer on an active table, the endpoint determines `open` via [editable poll check](computation:isPollOpen) (`true` when `status` is `OPEN` or `CONFIRMED` and `confirmedVenue` is absent/blank, otherwise `false`), keeps optional `confirmedVenue` via `whether`, and reads `Polling._getVote` for `(gathering, viewer)` via `whether` so `votedOption` is present when voted and `null`/absent otherwise. It formats `options` using [poll options](former:Polls.Viewing.PollOptions) over `Polling._listOptions` for `gathering` (oldest `createdAt` first), pairing each option with `voteCount` from `Polling._getVoteCount` and `canRemove` from [removal authorization](computation:canRemovePollOption) (`true` when `hosting` is true or `proposedBy` matches `viewer`). This endpoint is read-only and re-checks `Hosting` status and `Reserving` reservation membership on every request, so withdrawn or waitlisted guests immediately lose access.

```endpoints
Polls.Viewing.ViewPoll at /api/tables/poll
```

## Proposing, voting, and removing options

Each poll-editing endpoint takes `session` and `gathering` (plus action-specific fields), binds [current time](computation:now), resolves the caller through `Sessioning.current` (`UNKNOWN_SESSION`), reads `Hosting._getDetails` (`NO_SUCH_TABLE`), enforces [active table check](computation:isActiveTableStatus) (`TABLE_INACTIVE` when `CLOSED` or `CANCELLED`), and verifies participant membership via [user equality](computation:matchesUser) against `host` or `Reserving._hasReservation` (`NOT_PARTICIPANT`). It then checks [editable poll check](computation:isPollOpen); once `status` is `BOOKED` or `confirmedVenue` is set, it refuses `POLL_CLOSED` before mutating any state.

A participant [adds a location option](reaction:Polls.Editing.AddOption) with `label`, delegating solely to `Polling.addOption` (which enforces `INVALID_OPTION`, `DUPLICATE_OPTION`, and `OPTION_LIMIT_REACHED` with no partial effect) and returning `option` only after `Polling.addOption` succeeds. A participant [votes for an option](reaction:Polls.Voting.VoteOption) with `option`, calling `Polling.castVote` (which refuses `NO_SUCH_OPTION` when `option` is missing or belongs to another scope) and returning `voted: true`. A participant [clears their vote](reaction:Polls.Voting.ClearVote) by calling idempotent `Polling.clearVote` and returning `cleared: true`. A participant [removes an option](reaction:Polls.Editing.RemoveOption) with `option`: the endpoint reads `Polling._getOption` (refusing `NO_SUCH_OPTION` when missing or belonging to another gathering), checks [removal authorization](computation:canRemovePollOption) (`hosting` or `proposedBy` equals `viewer`, otherwise refusing `NOT_AUTHORIZED` with no state change), and calls `Polling.removeOption` (removing the option and all votes for it) before returning `removed: true`.

```endpoints
Polls.Editing.AddOption at /api/tables/poll/add
Polls.Voting.VoteOption at /api/tables/poll/vote
Polls.Voting.ClearVote at /api/tables/poll/unvote
Polls.Editing.RemoveOption at /api/tables/poll/remove
```

## Selecting a confirmed venue from the poll

A signed-in host [chooses a poll option as the confirmed venue](reaction:Polls.Venue.ChooseVenue) by sending `session`, `gathering`, and `option`. Binding [current time](computation:now), `Sessioning.current` resolves the caller to `viewer` (`UNKNOWN_SESSION`), and `Hosting._getDetails` reads `gathering` (`NO_SUCH_TABLE`). Using [user equality](computation:matchesUser), `viewer` must match the gathering's `host` (`NOT_HOST` otherwise). The endpoint checks [active table check](computation:isActiveTableStatus) (`TABLE_INACTIVE` for `CLOSED` or `CANCELLED`) and [editable poll check](computation:isPollOpen) (`POLL_CLOSED` when `BOOKED` or `confirmedVenue` is already set). It then reads `Polling._getOption` for `option` (refusing `NO_SUCH_OPTION` if missing or in another gathering) and invokes `Hosting.setVenue` with `gathering` and the option's `label`, returning `confirmedVenue` only after `Hosting.setVenue` commits. Under the venue selection from poll obligation, `Polling` is only read and not mutated: if `Hosting.setVenue` refuses (for example `CANNOT_SET_VENUE` on a concurrent status transition) before acknowledgement, neither `Hosting` nor `Polling` changes; once `Hosting.confirmedVenue` commits, subsequent poll mutations observe `confirmedVenue` via [editable poll check](computation:isPollOpen) and refuse `POLL_CLOSED`.

```endpoints
Polls.Venue.ChooseVenue at /api/tables/poll/choose-venue
```

## Clearing votes when a seated guest withdraws

When `Reserving.cancel` completes for `(resource, user)`, an internal reaction [clears the cancelling guest's poll vote](reaction:Polls.Clearing.ClearVoteOnSeatCancel) by calling `Polling.clearVote` with `scope: resource` and `voter: user`. Under the seat withdrawal vote cleanup obligation, this closing reaction runs synchronously inside the withdrawal flow after `Reserving.cancel` commits and before the enclosing `Tables.Joining.WithdrawTable` endpoint acknowledges. If `Polling.clearVote` fails after `Reserving.cancel` commits, `Reserving.cancel` and any FIFO waitlist promotion are not compensated or rolled back; during that false interval, the withdrawn guest already loses poll view/edit access via `Reserving._hasReservation` while their prior vote remains in `Polling` tallies. `Polling.clearVote` is idempotent with retry identity `(resource, user)`, and retry by `(resource, user)` (or later option removal or poll closure) is the operational recovery limit.

Shared computations [current time](computation:now) (from `design/compositions/Auth.md`) and [active table check](computation:isActiveTableStatus) (from `design/compositions/Profiles.md`) are reused without redeclaration.

```computations
matchesUser(a: String, b: String) : Flag
  Returns true when user identifiers a and b are equal, otherwise false.

isPollOpen(status: String, confirmedVenue?: String) : Flag
  Returns true when status is OPEN or CONFIRMED and confirmedVenue is absent or blank after trimming, otherwise false.

canRemovePollOption(hosting: Flag, proposedBy: String, viewer: String) : Flag
  Returns true when hosting is true or proposedBy equals viewer, otherwise false.
```
