# Concept Design

## Overview: Role of Concepts and Type Instantiation

Our app helps acquaintances within trusted communities move from *"anyone free?"* to a confirmed informal meal using a **Zoom-link sharing model**: a host creates a gathering, receives one or more unguessable shareable links (not tied to any recipient's identity), and drops them into existing group chats, mailing lists, or Slacks. To avoid overloaded concepts and reflect each mechanism's true underlying behavior, the design decomposes the application into seven small, single-purpose concepts:

1. **`Authenticating`** verifies user identities via one-time institutional email codes and records each user's verified email domain. It gates gathering creation and—when a gathering specifies a community scope—checks domain membership without social profiles or follower lists.
2. **`Hosting`** manages the meal-gathering lifecycle (`OPEN`, `CONFIRMED`, `BOOKED`, `CLOSED`, `CANCELLED`), dining terms (`budgetTier`, `dietaryNotes`), per-host active-table limits, and location fields (`area`, `confirmedVenue`). It stores no capacities, polls, link tokens, or potluck/game-night options.
3. **`LinkSharing`** issues, resolves, and revokes shareable link tokens for generic target resources. Links belong to the target (not to individual guests), so a single link dropped in a group chat can be used by multiple peers, while separate links for different channels can be revoked independently.
4. **`Reserving`** manages bounded capacities, explicit reservations, cancellations, cutoff locking, and FIFO waitlist promotion for a generic `Resource`. Separating reservation mechanics from `Hosting` lets cancelled spots reopen automatically on the same shared link.
5. **`Profiling`** stores each user's reusable dining preferences and restrictions (dietary needs, budget ceiling, max walking time, cuisine tastes) and aggregates an anonymized group constraint summary. It performs **no** restaurant recommendations or user-to-restaurant matching.
6. **`Polling`** runs approval polls where participating members propose candidate options and vote on a shortlist until closed, keeping voting independent of gathering timing and venue databases.
7. **`Notifying`** delivers immediate updates and cancellable scheduled reminders strictly to participating recipients (`Recipient`, `Subject`), keeping bystanders untouched and cancelling pending reminders when reservations are released.

### Access Model & Why There Is No Separate `Authorizing` Concept

We considered a standalone `Authorizing` concept for per-resource access control lists, but omitted it as unnecessary complexity under the Zoom-link model:
- **Viewing gathering details** uses `LinkSharing`: anyone with an active shared link token can view a gathering's details (`area`, `confirmedVenue`, time window, terms, live open spots) without identity-bound tokens.
- **Reserving a seat, proposing options, or voting** requires authentication (`Authenticating`) and—if the gathering specifies a `scope`—matching the verified email domain, rather than maintaining a per-person ACL; option proposals and votes are further restricted in reactions to the gathering's `host` (`Hosting`) and active reservation holders (`Reserving`).

### Generic Type Instantiations

| Concept | External Parameter | Bound To | Why / Role |
|---|---|---|---|
| `Hosting` | `Host` | `Authenticating.User` | Only authenticated users can host gatherings. |
| `LinkSharing` | `Target` | `Hosting.Gathering` | Shareable links resolve to gatherings without coupling `Hosting` to URL tokens. |
| `LinkSharing` | `Creator` | `Authenticating.User` | Only the creator (host) can issue or revoke links for their gathering. |
| `Reserving` | `Resource` | `Hosting.Gathering` | Each gathering owns one bounded reservation pool (`capacity` open guest spots). |
| `Reserving` | `User` | `Authenticating.User` | Reservations and waitlist entries identify authenticated users. |
| `Profiling` | `User` | `Authenticating.User` | Dining preference/restriction profiles belong to authenticated users across gatherings. |
| `Polling` | `Topic` | `Hosting.Gathering` | A gathering whose venue is chosen by the group opens one shortlist poll. |
| `Polling` | `Voter` | `Authenticating.User` | Only the gathering's host and current reservation holders may propose options and vote. |
| `Notifying` | `Recipient` | `Authenticating.User` | Notifications and reminders go only to hosts, reservation holders, and promoted guests. |
| `Notifying` | `Subject` | `Hosting.Gathering` | Notifications and scheduled reminders are keyed by gathering for clean cancellation. |

---

## Concept Specifications

### 1. Authenticating

**Purpose:** Verify user identities and institutional email domains via one-time email codes so gatherings can attribute hosts and enforce optional domain checks without passwords, social profiles, or follower lists.

**Principle:** A person requests a verification code for their email address and submits the matching code before it expires. Confirming the code authenticates them as a verified user associated with that email and its domain.

#### Types
```types
```

#### State
```state
a set of Users with
  a unique email String
  a domain String

a set of Challenges with
  an email String
  a code String
  a expiresAt DateTime
```

#### Actions
```actions
requestCode(email: String, now: DateTime) : returns (code: String)
  where email is a well-formed email address
  then
    generate a fresh one-time verification code
    add a new challenge with email, code, and expiresAt (now + 15 minutes)
    returns code
  where email is not well-formed
  then
    refuses INVALID_EMAIL "Please enter a valid email address."

verifyCode(email: String, code: String, now: DateTime) : returns (user: User)
  where a challenge exists with matching email and code and now <= expiresAt
  then
    remove matching challenges for email
    if no user exists with email then add a new user with email and domain extracted from email
    returns user
  where no matching unexpired challenge exists for email and code
  then
    refuses INVALID_OR_EXPIRED_CODE "The verification code is invalid or expired."
```

#### Queries
```queries
_getUser(user: User) : optional (email: String, domain: String)
  Returns email and domain for user, or no row if user does not exist.

_hasDomain(user: User, domain: String) : one (matches: Flag)
  Returns matches true if user exists and user's domain equals domain (case-insensitive); otherwise returns false.
```

#### Note
- **Code generation inside `Authenticating`:** `requestCode` generates the one-time code itself rather than accepting it from the caller, and returns `code` so a reaction can dispatch it over email (or log/display in local dev).
- **Minimal user identity:** `Users` stores only `email` and `domain`—no bios, avatars, or follower lists (Ethical Analysis #2, #6). HTTP session cookies belong to the web request boundary rather than `Authenticating`.
- **Open issue to resolve:** If a dorm or club wants board visibility scoped narrower than `@mit.edu`, the primary mechanism is sharing a `LinkSharing` link in that group's chat/list; if explicit roster checks are later needed, an `Authorizing` concept can be added cleanly without modifying `Authenticating`.

---

### 2. Hosting

**Purpose:** Manage the lifecycle, dining terms, and active-table limits of informal meal gatherings so hosts cannot leave unconfirmed gatherings active or spam community boards.

**Principle:** A host creates a meal gathering within their active-table limit, setting its time window, cutoff, budget/dietary notes, area, and optional venue. The host must confirm the gathering before its cutoff or it automatically closes; once confirmed with a venue, it can be marked booked and closes when its time window ends.

#### Types
```types
external Host
  An authenticated user who organizes a gathering.

BudgetTier is FREE or BUDGET or MODERATE or UPSCALE
GatheringStatus is OPEN or CONFIRMED or BOOKED or CLOSED or CANCELLED
```

#### State
```state
a set of Gatherings with
  a host Host
  a title String
  a status GatheringStatus
  a startTime DateTime
  a endTime DateTime
  a cutoffTime DateTime
  a budgetTier BudgetTier
  a dietaryNotes String
  an optional scope String
  a listedOnBoard Flag
  a area String
  an optional confirmedVenue String
  Rule: cutoffTime <= startTime and startTime < endTime
  Rule: each Host has at most 3 Gatherings with status OPEN or CONFIRMED
  Rule: if listedOnBoard is true then scope is present
```

#### Actions
```actions
create(
  host: Host,
  title: String,
  startTime: DateTime,
  endTime: DateTime,
  cutoffTime: DateTime,
  budgetTier: BudgetTier,
  dietaryNotes: String,
  scope?: String,
  listedOnBoard: Flag,
  area: String,
  confirmedVenue?: String,
  now: DateTime
) : returns (gathering: Gathering)
  where title is non-empty
    and area is non-empty
    and now < cutoffTime
    and cutoffTime <= startTime
    and startTime < endTime
    and host currently has fewer than 3 Gatherings with status OPEN or CONFIRMED
    and (listedOnBoard is false or scope is non-empty)
  then
    add a new gathering with status OPEN and the given fields
    returns gathering
  where host currently has 3 or more Gatherings with status OPEN or CONFIRMED
  then
    refuses HOST_LIMIT_REACHED "You already have the maximum number of active unbooked gatherings."
  where cutoffTime > startTime or startTime >= endTime or now >= cutoffTime
  then
    refuses INVALID_SCHEDULE "Gathering requires valid future cutoff, start, and end times."
  where listedOnBoard is true and (scope is missing or empty)
  then
    refuses MISSING_SCOPE "Board-listed gatherings must specify a community scope."

confirm(gathering: Gathering, host: Host, now: DateTime) : returns ()
  where gathering is in Gatherings and gathering's host is host and gathering's status is OPEN and now <= gathering's cutoffTime
  then
    set gathering's status to CONFIRMED
    returns
  where gathering is not in Gatherings or gathering's host is not host
  then
    refuses NOT_HOST "Only the gathering's host can confirm it."
  where gathering's status is not OPEN or now > gathering's cutoffTime
  then
    refuses CANNOT_CONFIRM "This gathering can no longer be confirmed."

setVenue(gathering: Gathering, confirmedVenue: String) : returns ()
  where gathering is in Gatherings and gathering's status is OPEN or CONFIRMED and confirmedVenue is non-empty
  then
    set gathering's confirmedVenue to confirmedVenue
    returns

markBooked(gathering: Gathering, host: Host) : returns ()
  where gathering is in Gatherings and gathering's host is host and gathering's status is CONFIRMED and gathering's confirmedVenue is present
  then
    set gathering's status to BOOKED
    returns
  where gathering is not in Gatherings or gathering's host is not host
  then
    refuses NOT_HOST "Only the gathering's host can mark it booked."
  where gathering's status is not CONFIRMED or gathering's confirmedVenue is missing
  then
    refuses CANNOT_BOOK "Confirm the gathering and set a venue before marking it booked."

cancel(gathering: Gathering, host: Host, now: DateTime) : returns ()
  where gathering is in Gatherings and gathering's host is host and gathering's status is OPEN or CONFIRMED or BOOKED
  then
    set gathering's status to CANCELLED
    returns
  where gathering is not in Gatherings or gathering's host is not host
  then
    refuses NOT_HOST "Only the gathering's host can cancel this gathering."

expireUnconfirmed(gathering: Gathering, now: DateTime) : returns ()
  where gathering is in Gatherings and gathering's status is OPEN and now > gathering's cutoffTime
  then
    set gathering's status to CLOSED
    returns

closeEnded(gathering: Gathering, now: DateTime) : returns ()
  where gathering is in Gatherings and gathering's status is CONFIRMED or BOOKED and now >= gathering's endTime
  then
    set gathering's status to CLOSED
    returns
```

#### Queries
```queries
_getDetails(gathering: Gathering) : optional (
  host: Host,
  title: String,
  status: GatheringStatus,
  startTime: DateTime,
  endTime: DateTime,
  cutoffTime: DateTime,
  budgetTier: BudgetTier,
  dietaryNotes: String,
  scope: String | undefined,
  listedOnBoard: Flag,
  area: String,
  confirmedVenue: String | undefined
)
  Returns details of gathering, or no row if gathering does not exist.

_listBoard(scope: String, fromTime: DateTime, toTime: DateTime) : many (
  gathering: Gathering,
  title: String,
  status: GatheringStatus,
  startTime: DateTime,
  cutoffTime: DateTime,
  budgetTier: BudgetTier,
  area: String,
  confirmedVenue: String | undefined
)
  Returns gatherings where listedOnBoard is true, scope matches, status is OPEN or CONFIRMED or BOOKED, and startTime falls in [fromTime, toTime], ordered ascending by startTime.
```

#### Note
- **Scoped strictly to restaurant and dining-hall meals:** Potlucks, game nights, dish/contribution expectations, and private home-address gating are intentionally omitted from this version to keep `Hosting` small and focused. If home potlucks or game nights are added later, gathering types, contribution terms, and gated private addresses can extend `Hosting` without changing `LinkSharing`, `Reserving`, `Profiling`, `Polling`, or `Notifying`.
- **Focused responsibilities:** `Hosting` stores no seat capacities (`Reserving`), shareable URL tokens (`LinkSharing`), or poll mode flags (implied when `confirmedVenue` starts unset and a `Polling` poll is opened).
- **Anti-spam lifecycle:** The 3-active-gathering cap per host and automatic `expireUnconfirmed` closure after `cutoffTime` prevent board clutter and abandoned tables (Ethical Analysis #7).
- **Open issue to resolve:** Requiring an explicit `confirm` click before `cutoffTime` protects against ghost tables, but could close a valid gathering if a host forgets. We pair it with a reminder 1 hour before cutoff via `Notifying`, and will test in Alpha/Beta whether explicit confirmation feels natural.

---

### 3. LinkSharing

**Purpose:** Issue, resolve, and revoke unguessable shareable links for target resources so an owner can share one link across a group or issue separate channel links without tying links to individual user identities.

**Principle:** A creator generates a shareable link token pointing to a target resource (optionally labeled by channel or given an expiration time). Anyone who presents an active, unexpired link resolves it to the target resource; revoking a link stops future access through that token without affecting other links or user identities.

#### Types
```types
external Target
  The resource or gathering that a shareable link points to.

external Creator
  The user permitted to create and revoke links for a target.
```

#### State
```state
a set of Links with
  a unique token String
  a Target
  a creator Creator
  an optional label String
  a active Flag
  an optional expiresAt DateTime
```

#### Actions
```actions
createLink(target: Target, creator: Creator, label?: String, expiresAt?: DateTime, now: DateTime) : returns (link: Link, token: String)
  where expiresAt is absent or expiresAt > now
  then
    generate a fresh unguessable unique token
    add a new link with token, target, creator, label, active true, and expiresAt
    returns (link, token)
  where expiresAt is present and expiresAt <= now
  then
    refuses INVALID_EXPIRY "Link expiration must be in the future."

revokeLink(link: Link, creator: Creator) : returns ()
  where link is in Links and link's creator is creator and link's active is true
  then
    set link's active to false
    returns
  where link is not in Links or link's creator is not creator
  then
    refuses NOT_CREATOR "Only the link creator can revoke this link."

revokeAllForTarget(target: Target) : returns ()
  where true
  then
    for every link in Links with matching target and active true, set active to false
    returns
```

#### Queries
```queries
_resolve(token: String, now: DateTime) : optional (target: Target, link: Link)
  Returns target and link if a Link exists with matching token, active true, and (expiresAt is absent or now < expiresAt); otherwise returns no row.

_listForTarget(target: Target) : many (link: Link, token: String, label: String | undefined, active: Flag, expiresAt: DateTime | undefined)
  Returns all links created for target ordered with active links first, or no rows if none exist.
```

#### Note
- **Not bijective to user identities:** A single `Link` (`token`) is a Zoom-like capability link meant to be dropped in a dorm list or Slack channel and used by multiple acquaintances. At the same time, a host can generate separate labeled links (e.g., `"Next House chat"` and `"6.1040 Slack"`) for the same gathering and revoke one if it spreads too widely.
- **Independent of `Hosting` and `Authenticating`:** `LinkSharing` knows nothing about meals, emails, or seats; whether someone who follows a resolved link must also be authenticated or match a community scope is enforced in reactions.
- **Open issue to resolve:** Currently `revokeAllForTarget` is only needed on spam takedown; ended or cancelled gatherings can remain readable via `Hosting._getDetails` as a closed status page while `Reserving` blocks new reservations.

---

### 4. Reserving

**Purpose:** Maintain an exact, live headcount for a bounded resource by converting soft interest into explicit reservations and automatically reassigning cancelled spots from a FIFO waitlist while open.

**Principle:** A resource pool opens with a positive capacity. While unlocked, users reserve open slots until capacity is reached, and subsequent users join a waitlist. If a reservation is cancelled while unlocked, the next waitlisted user is promoted into a new reservation automatically; once locked, reservations freeze.

#### Types
```types
external Resource
  The gathering or bounded resource whose capacity is being reserved.

external User
  An authenticated user who can reserve a slot or join the waitlist.
```

#### State
```state
a set of Pools with
  a unique Resource
  a capacity Number
  a locked Flag
  a waitlist seq of Users
  Rule: capacity >= 1
  Rule: waitlist contains no duplicate Users
  Rule: for every Pool, the count of Reservations for its Resource is <= capacity, and waitlist is disjoint from reserved Users

a set of Reservations with
  a Resource
  a User
  unique resource and user
```

#### Actions
```actions
openPool(resource: Resource, capacity: Number) : returns ()
  where no pool exists for resource and capacity >= 1
  then
    add a new pool with resource, capacity, locked false, and empty waitlist
    returns
  where capacity < 1 or a pool already exists for resource
  then
    refuses INVALID_POOL "A reservation pool requires a unique resource and capacity of at least 1."

reserve(resource: Resource, user: User) : returns (reservation: Reservation)
  where pool exists for resource, pool is not locked, no Reservation exists for (resource, user), and the count of Reservations for resource < pool's capacity
  then
    if user is in pool's waitlist then remove user from waitlist
    add a new reservation with resource and user
    returns reservation
  where pool is locked
  then
    refuses POOL_CLOSED "Reservations are locked for this resource."
  where a Reservation already exists for (resource, user)
  then
    refuses ALREADY_RESERVED "You already hold a reservation for this resource."
  where the count of Reservations for resource >= pool's capacity
  then
    refuses POOL_FULL "All spots are currently reserved; you may join the waitlist."

joinWaitlist(resource: Resource, user: User) : returns ()
  where pool exists for resource, pool is not locked, the count of Reservations for resource = pool's capacity, no Reservation exists for (resource, user), and user is not in pool's waitlist
  then
    append user to the end of pool's waitlist
    returns
  where pool is locked
  then
    refuses POOL_CLOSED "The waitlist is locked for this resource."
  where the count of Reservations for resource < pool's capacity
  then
    refuses SPOTS_AVAILABLE "Spots are still open; reserve directly."
  where a Reservation exists for (resource, user) or user is in pool's waitlist
  then
    refuses ALREADY_IN_POOL "You already hold a reservation or waitlist spot."

cancel(reservation: Reservation) : returns (resource: Resource, user: User)
  where reservation is in Reservations and pool for reservation's resource is not locked
  then
    record resource and user of reservation
    remove reservation from Reservations
    returns (resource, user)
  where reservation is not in Reservations
  then
    refuses NO_SUCH_RESERVATION "Reservation not found."
  where pool is locked
  then
    refuses CANNOT_CANCEL "Reservations are locked and can no longer be cancelled."

leaveWaitlist(resource: Resource, user: User) : returns ()
  where pool exists for resource and user is in pool's waitlist
  then
    remove user from pool's waitlist
    returns

promoteWaitlisted(resource: Resource) : returns (reservation: Reservation, promoted: User)
  where pool exists for resource, pool is not locked, the count of Reservations for resource < pool's capacity, and pool's waitlist is non-empty
  then
    pop the first user from pool's waitlist as promoted
    add a new reservation with resource and promoted
    returns (reservation, promoted)

lock(resource: Resource) : returns ()
  where pool exists for resource and pool is not locked
  then
    set pool's locked to true
    returns
```

#### Queries
```queries
_getAvailability(resource: Resource) : optional (capacity: Number, reservedCount: Number, remaining: Number, waitlistCount: Number, locked: Flag)
  Returns live counts (remaining = capacity - reservedCount) for resource, or no row if no pool exists.

_hasReservation(resource: Resource, user: User) : one (reserved: Flag)
  Returns reserved true if a Reservation exists for (resource, user); otherwise false.

_getReservation(resource: Resource, user: User) : optional (reservation: Reservation)
  Returns the reservation handle for (resource, user), or no row if none exists.

_getReservedUsers(resource: Resource) : many (user: User)
  Returns all users currently holding a Reservation for resource in unspecified order, or no rows if none/unknown.

_getWaitlistPosition(resource: Resource, user: User) : optional (position: Number)
  Returns 1-based position of user in waitlist for resource, or no row if not waitlisted.
```

#### Note
- **No duplicated deadline state:** `Reserving` tracks `locked: Flag` rather than duplicating `Hosting.cutoffTime`; reactions call `lock(resource)` when `Hosting` reaches cutoff or closes. That keeps `Reserving` reusable for any capacity-bounded resource.
- **Capacity counts guest spots:** `capacity` tracks open guest reservations alongside the host (covering both a GRA bringing 10 residents on guest swipes in BS3 and an office peer opening 4 seats at a tapas table in BS2).
- **Separate `reserve`, `joinWaitlist`, and `promoteWaitlisted`:** Splitting these prevents disjunctive action behavior and makes waitlist promotion and notification explicit in reactions whenever `cancel` fires.
- **Open issue to resolve:** Once `lock` fires at `cutoffTime`, guests cannot self-cancel; for Beta we should consider whether a post-cutoff release action should still allow an emergency drop that notifies the host.

---

### 5. Profiling

**Purpose:** Let participants privately record their personal dining restrictions and preferences once so a group can view an anonymized summary of shared constraints without awkward public negotiation.

**Principle:** A user sets their dietary restrictions, budget ceiling, optional walking limit, and cuisine preferences in their profile. When a group of users prepares to dine together, summarizing their profiles surfaces the combined dietary requirements and tightest budget/distance limits anonymously without attributing any constraint to a specific individual.

#### Types
```types
external User
  An authenticated user whose dining constraints and tastes are recorded.

DietaryTag is VEGETARIAN or VEGAN or HALAL or KOSHER or GLUTEN_FREE or DAIRY_FREE or NUT_FREE
BudgetTier is FREE or BUDGET or MODERATE or UPSCALE
```

#### State
```state
a set of Profiles with
  a unique User
  a dietaryRestrictions set of DietaryTag
  a maxBudget BudgetTier
  an optional maxWalkMinutes Number
  a cuisinePreferences set of String
  an optional notes String
```

#### Actions
```actions
setProfile(
  user: User,
  dietaryRestrictions: set of DietaryTag,
  maxBudget: BudgetTier,
  maxWalkMinutes?: Number,
  cuisinePreferences: set of String,
  notes?: String
) : returns ()
  where maxWalkMinutes is absent or maxWalkMinutes > 0
  then
    create or update the profile for user with dietaryRestrictions, maxBudget, maxWalkMinutes, cuisinePreferences, and notes
    returns
  where maxWalkMinutes is present and maxWalkMinutes <= 0
  then
    refuses INVALID_DISTANCE "Maximum walking time must be positive."

clearProfile(user: User) : returns ()
  where a profile exists for user
  then
    remove user's profile
    returns
```

#### Queries
```queries
_getProfile(user: User) : optional (
  dietaryRestrictions: set of DietaryTag,
  maxBudget: BudgetTier,
  maxWalkMinutes: Number | undefined,
  cuisinePreferences: set of String,
  notes: String | undefined
)
  Returns user's stored profile so they can view or edit it, or no row if none is set.

_summarizeGroup(users: set of Users) : one (
  requiredDiets: set of DietaryTag,
  dietaryBreakdown: set of (tag: DietaryTag, count: Number),
  tightestBudget: BudgetTier,
  tightestWalkMinutes: Number | undefined,
  cuisinePreferences: set of String,
  profiledCount: Number
)
  Aggregates profiles across users anonymously without returning any User identity:
  requiredDiets is the union of dietaryRestrictions;
  dietaryBreakdown counts how many profiled users require each tag;
  tightestBudget is the minimum maxBudget under FREE < BUDGET < MODERATE < UPSCALE (or UPSCALE if none profiled);
  tightestWalkMinutes is the minimum present maxWalkMinutes (or undefined if none set);
  cuisinePreferences is the union of preferred cuisines;
  profiledCount is the number of users in users who have a Profile.
```

#### Note
- **Strictly `Profiling`, not matching or recommending:** The application does **not** maintain a restaurant database, score restaurant compatibility, or match users to users or restaurants. `Profiling` holds each user's constraints once and exposes `_summarizeGroup` so the host and reserved guests quietly see e.g. *"1 halal, 1 vegetarian; max budget: BUDGET; max walk: 15 min"* before proposing or voting on options in `Polling`.
- **Anonymity by construction:** `_summarizeGroup` never returns individual `User` identities or individual profiles to other guests, addressing Noah's hesitation in BS1 and Ethical Analysis #2.
- **Open issue to resolve:** Free-text `notes` (e.g., severe allergy details) could inadvertently identify someone; before Beta we should decide whether `notes` stays visible only to the host or is omitted from `_summarizeGroup`.

---

### 6. Polling

**Purpose:** Let a participating group propose options and converge on a single choice without endless chat negotiation.

**Principle:** A poll opens for a topic. While open, participants propose options and cast or retract approval votes on acceptable candidates. When the poll closes, the candidate with the most votes is selected as the winner.

#### Types
```types
external Topic
  The gathering or decision context owning a poll.

external Voter
  A participant permitted to propose options or vote in the poll.

PollStatus is OPEN or CLOSED or CANCELLED
```

#### State
```state
a set of Polls with
  a unique Topic
  a status PollStatus
  an optional winner Option
  Rule: winner, when present, is an Option belonging to this Poll

a set of Options with
  a Poll
  a label String
  an optional note String
  a proposedBy Voter
  unique poll and label

a set of Votes with
  a Poll
  a Voter
  an Option
  unique poll and voter and option
  Rule: Option's poll equals Vote's poll
```

#### Actions
```actions
openPoll(topic: Topic) : returns (poll: Poll)
  where no poll exists for topic
  then
    add a new poll with topic and status OPEN
    returns poll
  where a poll already exists for topic
  then
    refuses POLL_EXISTS "A poll already exists for this topic."

proposeOption(poll: Poll, proposer: Voter, label: String, note?: String) : returns (option: Option)
  where poll is in Polls, poll's status is OPEN, label is non-empty, and no Option in poll has the same label
  then
    add a new option with poll, label, note, and proposedBy proposer
    returns option
  where poll's status is not OPEN
  then
    refuses POLL_CLOSED "Options cannot be added after polling closes."
  where an Option in poll already has label
  then
    refuses DUPLICATE_OPTION "That option is already on the shortlist."

removeOption(poll: Poll, option: Option) : returns ()
  where poll is in Polls, poll's status is OPEN, and option belongs to poll
  then
    remove all Votes for option
    remove option from Options
    returns

castVote(poll: Poll, voter: Voter, option: Option) : returns ()
  where poll is in Polls, poll's status is OPEN, option belongs to poll, and no Vote exists for (poll, voter, option)
  then
    add a new vote with poll, voter, and option
    returns
  where poll's status is not OPEN
  then
    refuses POLL_CLOSED "Voting is closed for this poll."
  where option does not belong to poll
  then
    refuses INVALID_OPTION "That option does not belong to this poll."

retractVote(poll: Poll, voter: Voter, option: Option) : returns ()
  where poll is in Polls, poll's status is OPEN, and a Vote exists for (poll, voter, option)
  then
    remove the vote for (poll, voter, option)
    returns

clearVoterVotes(poll: Poll, voter: Voter) : returns ()
  where poll is in Polls and poll's status is OPEN
  then
    remove all Votes in poll where vote's voter is voter
    returns

closePoll(poll: Poll) : returns (winner: Option, winnerLabel: String)
  where poll is in Polls, poll's status is OPEN, and at least one Option belongs to poll
  then
    select winner as the Option in poll with the highest number of Votes (breaking ties deterministically by lexicographical order of label)
    set poll's winner to winner
    set poll's status to CLOSED
    returns (winner, winner's label)
  where no Option belongs to poll
  then
    refuses NO_OPTIONS "Cannot select a winner because no options were proposed."

cancelPoll(poll: Poll) : returns ()
  where poll is in Polls and poll's status is OPEN
  then
    set poll's status to CANCELLED
    returns
```

#### Queries
```queries
_getPoll(topic: Topic) : optional (poll: Poll, status: PollStatus, winner: Option | undefined)
  Returns poll metadata and winner (if closed) for topic, or no row if no poll exists for topic.

_getOptionTallies(poll: Poll) : many (option: Option, label: String, note: String | undefined, voteCount: Number)
  Returns every Option belonging to poll with its current vote count (0 if unvoted), ordered descending by voteCount then ascending by label.

_getVoterChoices(poll: Poll, voter: Voter) : many (option: Option)
  Returns the Options voted for by voter in poll, or no rows if none/unknown.
```

#### Note
- **No duplicated deadline state:** Like `Reserving`, `Polling` does not duplicate `Hosting.cutoffTime`; it stays `OPEN` until `closePoll` or `cancelPoll` is invoked by reaction when the gathering hits cutoff or closes.
- **Human-proposed options + approval voting:** `Polling` owns its own `Options` (`label` + optional `note` like `"~$$, halal options"`). Participants read `Profiling._summarizeGroup` and propose/approve options that fit everyone; approval voting avoids 1–1–1–1 ties in small groups.
- **Open issue to resolve:** If a poll-enabled gathering reaches `cutoffTime` with zero proposed options, `closePoll` refuses. In Beta we should notify the host ahead of cutoff if no options have been proposed yet.

---

### 7. Notifying

**Purpose:** Deliver timely event updates and scheduled pre-cutoff reminders strictly to participating recipients, cancelling pending reminders if plans change so bystanders and former participants are never spammed.

**Principle:** When an event happens, a notification is sent immediately to the relevant recipient. When a future reminder is scheduled for a recipient and subject, it is delivered once its target time arrives—unless cancelled earlier because the recipient withdrew or the subject closed.

#### Types
```types
external Recipient
  The user who should receive a notification.

external Subject
  The gathering or entity the notification refers to.

NotificationStatus is SCHEDULED or SENT or READ or CANCELLED
```

#### State
```state
a set of Notifications with
  a Recipient
  a Subject
  a kind String
  a message String
  a sendAt DateTime
  a status NotificationStatus
```

#### Actions
```actions
notify(recipient: Recipient, subject: Subject, kind: String, message: String, now: DateTime) : returns (notification: Notification)
  where message is non-empty
  then
    add a new notification with recipient, subject, kind, message, sendAt now, and status SENT
    returns notification

schedule(recipient: Recipient, subject: Subject, kind: String, message: String, sendAt: DateTime) : returns (notification: Notification)
  where message is non-empty
  then
    add a new notification with recipient, subject, kind, message, sendAt, and status SCHEDULED
    returns notification

deliver(notification: Notification, now: DateTime) : returns ()
  where notification is in Notifications and notification's status is SCHEDULED and now >= notification's sendAt
  then
    set notification's status to SENT
    returns

cancelForRecipient(recipient: Recipient, subject: Subject) : returns ()
  where true
  then
    for every notification in Notifications with matching recipient, subject, and status SCHEDULED, set status to CANCELLED
    returns

cancelForSubject(subject: Subject) : returns ()
  where true
  then
    for every notification in Notifications with matching subject and status SCHEDULED, set status to CANCELLED
    returns

markRead(notification: Notification, recipient: Recipient) : returns ()
  where notification is in Notifications and notification's recipient is recipient and notification's status is SENT
  then
    set notification's status to READ
    returns
```

#### Queries
```queries
_listInbox(recipient: Recipient) : many (notification: Notification, subject: Subject, kind: String, message: String, sendAt: DateTime, status: NotificationStatus)
  Returns all notifications for recipient with status SENT or READ, ordered descending by sendAt, or no rows if none exist.

_listDueScheduled(now: DateTime) : many (notification: Notification, recipient: Recipient, subject: Subject, kind: String, message: String)
  Returns all notifications with status SCHEDULED and sendAt <= now, ordered ascending by sendAt.
```

#### Note
- **Bystander protection by construction:** `Notifying` has no broadcast or channel-subscription mechanism; every notification targets one explicit `Recipient` bound by reactions only to hosts, reservation holders, or promoted guests.
- **Explicit cancellation:** Separating `cancelForRecipient` (on reservation cancellation) from `cancelForSubject` (on gathering cancellation/expiry) prevents ghost reminders when plans change.
- **Open issue to resolve:** For Alpha, notifications populate an in-app inbox (`_listInbox`); for Beta/User Testing we need to decide whether `deliver` also dispatches transactional email via the user's `Authenticating` email.

---

## Essential Reactions

The reactions below capture how the seven independent concepts compose to realize Zoom-link creation and resolution, domain/address access control, reservation and waitlist flow, poll coordination, and reminder hygiene.

### A. Access Control & Zoom-Link Resolution

#### 1. `createGatheringAuthorized` & `createInitialLinkOnCreate`
```
reaction createGatheringAuthorized
when Requesting.createGathering (
  actor, title, startTime, endTime, cutoffTime,
  budgetTier, dietaryNotes, scope, listedOnBoard, area, confirmedVenue, now
)
where Authenticating: actor is in Users
  and (scope is absent or Authenticating: _hasDomain(actor, scope) is true)
then Hosting.create (
  host: actor, title, startTime, endTime, cutoffTime,
  budgetTier, dietaryNotes, scope, listedOnBoard, area, confirmedVenue, now
)

reaction createInitialLinkOnCreate
when
  Requesting.createGathering (actor, linkLabel, now)
  Hosting.create () : returns (gathering)
then
  LinkSharing.createLink (target: gathering, creator: actor, label: linkLabel, expiresAt: undefined, now)
```
**Note:** Requires the host to be authenticated (`Authenticating`) and—if they set an institutional `scope` like `"mit.edu"`—verified in that domain themselves (Ethical Analysis #7). Upon creation, `LinkSharing` automatically issues the first shareable link for the host to drop into a chat or email; the host can also create or revoke additional links later via `LinkSharing.createLink` / `LinkSharing.revokeLink`.

#### 2. `viewByLink`
```
reaction viewByLink
when Requesting.viewByLink (token, now)
where LinkSharing: _resolve(token, now) returns (target, link)
then
  Hosting._getDetails (gathering: target)
  Reserving._getAvailability (resource: target)
```
**Note:** Embodies the Zoom-link model: anyone with an active shared `token` can view gathering details (`area`, `confirmedVenue`, terms, live remaining spots) without signing in or having an identity-bound link (Ethical Analysis #3).

#### 3. `reserveByLinkAuthorized` & `joinWaitlistByLinkAuthorized`
```
reaction reserveByLinkAuthorized
when Requesting.reserveByLink (actor, token, now)
where LinkSharing: _resolve(token, now) returns (target, link)
  and Hosting: target is gathering with status OPEN or CONFIRMED
  and (gathering's scope is absent or Authenticating: _hasDomain(actor, gathering's scope) is true)
then Reserving.reserve (resource: target, user: actor)

reaction joinWaitlistByLinkAuthorized
when Requesting.joinWaitlistByLink (actor, token, now)
where LinkSharing: _resolve(token, now) returns (target, link)
  and Hosting: target is gathering with status OPEN or CONFIRMED
  and (gathering's scope is absent or Authenticating: _hasDomain(actor, gathering's scope) is true)
then Reserving.joinWaitlist (resource: target, user: actor)
```
**Note:** Multiple peers in a group chat resolve the same `token`, and any authenticated user matching the gathering's optional `scope` can reserve directly without manual host approval (Ethical Analysis #2, #5).

#### 4. `proposeAndVoteAuthorized`
```
reaction proposeOptionAuthorized
when Requesting.proposeOption (actor, gathering, label, note)
where (Hosting: actor is host of gathering or Reserving: _hasReservation(resource: gathering, user: actor) is true)
  and Polling: poll has topic gathering
then Polling.proposeOption (poll, proposer: actor, label, note)

reaction castVoteAuthorized
when Requesting.castVote (actor, gathering, option)
where (Hosting: actor is host of gathering or Reserving: _hasReservation(resource: gathering, user: actor) is true)
  and Polling: poll has topic gathering
then Polling.castVote (poll, voter: actor, option)
```
**Note:** Allows both the host (e.g., Noah in BS1) and active reservation holders to propose options and vote while excluding bystanders or unreserved link viewers.

---

### B. Gathering Setup, Confirmation & Cutoff Lifecycle

#### 5. `openPoolOnCreate`
```
reaction openPoolOnCreate
when
  Requesting.createGathering (capacity)
  Hosting.create () : returns (gathering)
then
  Reserving.openPool (resource: gathering, capacity)
```
**Note:** Keeps seat-capacity state out of `Hosting` while ensuring every gathering gets a bounded reservation pool.

#### 6. `openPollOnCreate` & `seedInitialOptionsOnCreate`
```
reaction openPollOnCreate
when
  Requesting.createGathering (enablePoll: true)
  Hosting.create () : returns (gathering)
then
  Polling.openPoll (topic: gathering)

reaction seedInitialOptionsOnCreate
when
  Requesting.createGathering (actor, enablePoll: true, initialOptions)
  Polling.openPoll () : returns (poll)
where label is in initialOptions
then
  Polling.proposeOption (poll, proposer: actor, label, note: undefined)
```
**Note:** Fixed-venue gatherings (`enablePoll: false`, `confirmedVenue` provided) never touch `Polling`. When `enablePoll` is true, `Polling` opens a shortlist poll and seeds any initial suggestions entered by the host.

#### 7. `scheduleHostConfirmReminder`
```
reaction scheduleHostConfirmReminder
when Hosting.create (host, title, cutoffTime) : returns (gathering)
then Notifying.schedule (
  recipient: host,
  subject: gathering,
  kind: "HOST_CONFIRM_REMINDER",
  message: "Confirm your gathering \"" ^ title ^ "\" before the RSVP cutoff so it stays open.",
  sendAt: cutoffTime - 1 hour
)
```
**Note:** Reminds legitimate hosts to confirm before `cutoffTime` so their table is not closed by `expireUnconfirmed`.

#### 8. `handleCutoffAndPollClose`
```
reaction closeUnconfirmedAtCutoff
when System.tick (now)
where Hosting: gathering's status is OPEN and now > gathering's cutoffTime
then
  Hosting.expireUnconfirmed (gathering, now)
  Reserving.lock (resource: gathering)

reaction lockConfirmedAtCutoff
when System.tick (now)
where Hosting: gathering's status is CONFIRMED and now >= gathering's cutoffTime
  and Reserving: pool exists for gathering and pool is not locked
then
  Reserving.lock (resource: gathering)

reaction closePollAtCutoff
when System.tick (now)
where Hosting: gathering's status is CONFIRMED and now >= gathering's cutoffTime
  and Polling: poll has topic gathering, poll's status is OPEN, and poll has at least one Option
then
  Polling.closePoll (poll)

reaction applyPollWinnerToGathering
when Polling.closePoll (poll) : returns (winner, winnerLabel)
where Hosting: gathering is poll's topic
then
  Hosting.setVenue (gathering, confirmedVenue: winnerLabel)
```
**Note:** Centralizes deadline handling in `Hosting.cutoffTime` so neither `Reserving` nor `Polling` needs its own clock logic. At cutoff, unconfirmed gatherings expire and drop off the board, confirmed gatherings lock reservations, and open polls select a winning venue and write it onto `Hosting`.

#### 9. `cleanupOnGatheringStop`
```
reaction cleanupOnGatheringStop
when Hosting.cancel (gathering)
  or Hosting.expireUnconfirmed (gathering)
then
  Reserving.lock (resource: gathering)
  Notifying.cancelForSubject (subject: gathering)

reaction cancelPollOnGatheringStop
when Hosting.cancel (gathering)
  or Hosting.expireUnconfirmed (gathering)
where Polling: poll has topic gathering and poll's status is OPEN
then
  Polling.cancelPoll (poll)

reaction notifyReservedOnGatheringStop
when Hosting.cancel (gathering, now)
  or Hosting.expireUnconfirmed (gathering, now)
where Hosting: title is gathering's title
  and Reserving: member is in _getReservedUsers(gathering)
then
  Notifying.notify (
    recipient: member,
    subject: gathering,
    kind: "GATHERING_CLOSED",
    message: "\"" ^ title ^ "\" was cancelled or closed before confirmation.",
    now
  )
```
**Note:** Locks reservations, cancels any open poll, cancels pending pre-cutoff reminders, and notifies currently reserved guests—keeping fixed-venue gatherings completely independent of `Polling`.

---

### C. Live Seat Reopening, Waitlist Promotion & Reminder Hygiene

#### 10. `scheduleReminderOnReserve`
```
reaction scheduleReminderOnReserve
when Reserving.reserve (resource, user)
where Hosting: resource is gathering with title and cutoffTime
then Notifying.schedule (
  recipient: user,
  subject: resource,
  kind: "CUTOFF_REMINDER",
  message: "RSVP cutoff for \"" ^ title ^ "\" is coming up; cancel your reservation if your plans changed.",
  sendAt: cutoffTime - 2 hours
)
```
**Note:** Reminders go strictly to users holding a reservation (Ethical Analysis #3). *(Edge case: if `now >= cutoffTime - 2 hours` when reserving, implementation skips scheduling a past-due reminder.)*

#### 11. `cleanupOnReservationCancel`
```
reaction cancelReminderOnReservationCancel
when Reserving.cancel () : returns (resource, user)
then Notifying.cancelForRecipient (recipient: user, subject: resource)

reaction clearVotesOnReservationCancel
when Reserving.cancel () : returns (resource, user)
where Polling: poll has topic resource and poll's status is OPEN
  and Hosting: user is not host of resource
then Polling.clearVoterVotes (poll, voter: user)
```
**Note:** Cancels pending reminders so withdrawn guests are never pinged, and clears their poll votes so ex-guests cannot bias the venue choice for the remaining group.

#### 12. `promoteWaitlistOnCancel`
```
reaction promoteWaitlistOnCancel
when Reserving.cancel () : returns (resource, user)
where Reserving: pool for resource is not locked and pool's waitlist is non-empty
then Reserving.promoteWaitlisted (resource)

reaction notifyAndRemindPromoted
when Reserving.promoteWaitlisted (resource) : returns (reservation, promoted)
where Hosting: resource is gathering with title and cutoffTime
  and Requesting/System supplies current time now
then
  Notifying.notify (
    recipient: promoted,
    subject: resource,
    kind: "WAITLIST_PROMOTED",
    message: "A spot opened for \"" ^ title ^ "\" and your reservation is now confirmed.",
    now
  )
  Notifying.schedule (
    recipient: promoted,
    subject: resource,
    kind: "CUTOFF_REMINDER",
    message: "RSVP cutoff for \"" ^ title ^ "\" is coming up; cancel your reservation if your plans changed.",
    sendAt: cutoffTime - 2 hours
  )
```
**Note:** Directly solves Bad Situations 2 and 3. When a reservation is cancelled while unlocked, either the spot immediately reopens on existing `LinkSharing` links (if the waitlist is empty) or the next waitlisted peer is promoted, notified, and scheduled for a cutoff reminder—without noisy channel re-blasts.

---

### D. Anonymous Group Constraint Summary

#### 13. `viewGroupConstraints`
```
reaction viewGroupConstraints
when Requesting.viewGroupConstraints (actor, gathering)
where (Hosting: actor is host of gathering or Reserving: _hasReservation(resource: gathering, user: actor) is true)
  and Hosting: host is gathering's host
  and Reserving: reserved is _getReservedUsers(gathering)
then Profiling._summarizeGroup (users: {host} union reserved)
```
**Note:** Connects `Profiling` to `Hosting` and `Reserving` without embedding any recommendation or matching logic. Including `host` alongside `reserved` ensures the organizer's own dietary/budget constraints (e.g., Noah in BS1) are reflected anonymously in the summary while keeping individual profiles private from link viewers and peers.
