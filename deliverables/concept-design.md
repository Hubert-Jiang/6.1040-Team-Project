# Concept Design

## Overview: Role of Concepts and Type Instantiation

Our app helps acquaintances within trusted communities move from *"anyone free?"* to a confirmed informal meal using a **Zoom-link sharing model**: a host creates a meal gathering, receives one or more unguessable shareable links (not tied to any recipient's identity), and drops them into existing group chats, mailing lists, or Slacks. When an unauthenticated peer follows a link and clicks accept with their email, their pending acceptance is tracked while they verify their email and automatically completes once authenticated. The design decomposes the application into eight focused, single-purpose concepts:

1. **`Authenticating`** verifies user identities via one-time institutional email codes and records each user's verified email domain. It gates gathering creation and—when a gathering specifies a community scope—checks domain membership without social profiles or follower lists.
2. **`Hosting`** manages the meal-gathering lifecycle (`OPEN`, `CONFIRMED`, `BOOKED`, `CLOSED`, `CANCELLED`), basic event metadata (`title`, time window, `area`, optional `details` and `confirmedVenue`), and per-host active-table limits. It stores no capacities, polls, link tokens, or user dietary/budget constraints.
3. **`Linking`** issues, resolves, and revokes shareable link tokens for generic target resources. Links belong to the target (not to individual guests), so a single link dropped in a group chat can be resolved by many peers, while separate links for different channels can be revoked independently.
4. **`Inviting`** records guest acceptances to an event (with clean withdrawal for guests whose plans change) and tracks pending email-keyed acceptances (`PendingAcceptances`) while an unauthenticated prospective guest completes email verification, automatically accepting the invite once verified. Uninterested peers simply ignore the shared link without needing an account or a declined cookie.
5. **`Reserving`** manages bounded capacities, explicit reservations, cancellations, cutoff locking, and FIFO waitlist promotion for a generic `Resource`. Separating reservation mechanics from `Hosting` and `Inviting` lets cancelled spots reopen automatically on the same shared link.
6. **`Profiling`** stores each user's reusable dining preferences and restrictions (dietary needs, budget preference, walking preference, cuisine tastes, notes) so table participants can view each other's dining profiles to make a qualitative group decision without public chat clutter. It performs **no** restaurant recommendations, user-to-user matching, or deterministic filtering.
7. **`Polling`** runs approval polls for gatherings where the host has not pre-selected a restaurant: if the host already has a restaurant in mind (`confirmedVenue` is set at creation), no poll is created; if the host leaves the restaurant unselected, `Polling` opens automatically so invitees can propose and vote on options until cutoff.
8. **`Notifying`** delivers immediate updates and cancellable scheduled reminders strictly to participating recipients (`Recipient`, `Subject`), keeping bystanders untouched and cancelling pending reminders when reservations are released.

### Two Ways to Choose a Venue

A host chooses the venue in one of two ways when creating a gathering. A host who already has a restaurant or dining hall in mind (Alice in BS2 or Maya in BS3) enters it as `confirmedVenue`, so guests simply claim seats and no poll is created (`Polling` is never involved). That host can mark the gathering booked whenever they make the reservation, either right after creating it or once the headcount settles at the cutoff. A host who only has a time window and area (Noah in BS1) instead leaves `confirmedVenue` unset (and can seed a few initial suggestions), which automatically opens a `Polling` poll so the host and accepted invitees can propose and vote on options until the cutoff, when the winning option becomes `confirmedVenue` (reactions 8 and 10).

### Access Model & Why There Is No Separate `Authorizing` Concept

We considered a standalone `Authorizing` concept for per-resource access control lists, but omitted it as unnecessary complexity under the Zoom-link model:
- **Viewing gathering details** uses `Linking`: anyone with an active shared link token can view a gathering's details (`area`, `confirmedVenue`, time window, terms, live open spots) without identity-bound tokens.
- **Accepting an invite, reserving a seat, or voting** requires authentication (`Authenticating`) and—if the gathering specifies a `scope`—matching the verified email domain, rather than maintaining a per-person ACL; option proposals, votes, and tablemate profile views are further restricted in reactions to the gathering's `host` (`Hosting`) and active reservation holders (`Reserving`).

### Generic Type Instantiations

| Concept | External Parameter | Bound To | Why / Role |
|---|---|---|---|
| `Hosting` | `Host` | `Authenticating.User` | Only authenticated users can host gatherings. |
| `Linking` | `Target` | `Hosting.Gathering` | Shareable links resolve to gatherings without coupling `Hosting` to URL tokens. |
| `Linking` | `Creator` | `Authenticating.User` | Only the creator (host) can issue or revoke links for their gathering. |
| `Inviting` | `Event` | `Hosting.Gathering` | Guest acceptances and pending pre-auth acceptances target a gathering. |
| `Inviting` | `Guest` | `Authenticating.User` | Completed invite acceptances identify authenticated users. |
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
- **Open issue to resolve:** Narrower group scoping (e.g., a single dorm floor or cultural club) currently relies on the host sharing a `Linking` link only inside that group's chat or mailing list; if explicit roster checks are later needed alongside a community board, an `Authorizing` concept can be added cleanly without modifying `Authenticating`.

---

### 2. Hosting

**Purpose:** Manage the lifecycle, basic event details, and active-table limits of informal meal gatherings so hosts cannot leave unconfirmed gatherings active or spam shared channels.

**Principle:** A host creates a meal gathering within their active-table limit, setting its time window, cutoff, area, and optional event details or venue. The host must confirm the gathering before its cutoff or it automatically closes; once confirmed with a venue, it can be marked booked and closes when its time window ends.

#### Types
```types
external Host
  An authenticated user who organizes a gathering.

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
  an optional details String
  an optional scope String
  a area String
  an optional confirmedVenue String
  Rule: cutoffTime <= startTime and startTime < endTime
  Rule: each Host has at most 3 Gatherings with status OPEN or CONFIRMED
```

#### Actions
```actions
create(
  host: Host,
  title: String,
  startTime: DateTime,
  endTime: DateTime,
  cutoffTime: DateTime,
  details?: String,
  scope?: String,
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
  then
    add a new gathering with status OPEN and the given fields
    returns gathering
  where host currently has 3 or more Gatherings with status OPEN or CONFIRMED
  then
    refuses HOST_LIMIT_REACHED "You already have the maximum number of active unbooked gatherings."
  where cutoffTime > startTime or startTime >= endTime or now >= cutoffTime
  then
    refuses INVALID_SCHEDULE "Gathering requires valid future cutoff, start, and end times."

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
  details: String | undefined,
  scope: String | undefined,
  area: String,
  confirmedVenue: String | undefined
)
  Returns details of gathering, or no row if gathering does not exist.
```

#### Note
- **Zoom-link-only distribution (public boards/feeds deferred):** Gatherings do not appear on any public in-app board or feed; peers reach a table exclusively through a `Linking` URL shared by the host in an existing chat or mailing list. Deferring public boards has several advantages: (1) stronger privacy, since hosts do not broadcast their schedules or dining plans across an entire institution; (2) lower no-show and flake risk, since acquaintances arriving from a shared social/workplace channel are less likely to flake or clash socially than strangers browsing an open feed; (3) reduced moderation and anti-spam scope, since there is no global discovery feed to patrol for spam or reappropriation; and (4) less user friction, since hosts keep using the channels they already check. Like potlucks and game nights, an opt-in community board can be re-introduced later if break-staying newcomers need broader discovery.
- **Why structured budget/dietary tags live in `Profiling`, not `Hosting`:** Previously `Hosting` duplicated `BudgetTier` and `dietaryNotes`, which forced hosts to specify a budget even when no venue had been chosen yet and conflated gathering lifecycle with dining preferences. Free-form `details` lets a host jot down event context (e.g., *"Tapas ~$25"* or *"Maseeh guest swipes"*) when relevant, while all structured dietary/budget preferences live exclusively in `Profiling`.
- **Scoped strictly to restaurant and dining-hall meals:** Potlucks, game nights, dish/contribution expectations, and private home-address gating are intentionally omitted from this version to keep `Hosting` small and focused. If home potlucks or game nights are added later, gathering types, contribution terms, and gated private addresses can extend `Hosting` without changing `Linking`, `Inviting`, `Reserving`, `Profiling`, `Polling`, or `Notifying`.
- **Two-option restaurant choice (no poll when a restaurant is chosen):** Gatherings support two clear modes driven directly by `confirmedVenue`. Option 1 (fixed restaurant): if the host already has a restaurant or dining hall in mind and provides `confirmedVenue` at creation, no poll is ever created. Option 2 (invitee vote): if the host leaves `confirmedVenue` unset at creation, a reaction automatically opens a `Polling` poll so invitees can propose and vote on restaurants before `cutoffTime`.
- **Focused responsibilities:** `Hosting` stores no seat capacities (`Reserving`), shareable URL tokens (`Linking`), guest invite states (`Inviting`), or separate poll-mode booleans (implied directly by whether `confirmedVenue` is present at creation).
- **Anti-spam lifecycle:** The 3-active-gathering cap per host and automatic `expireUnconfirmed` closure after `cutoffTime` prevent abandoned tables and spam link generation (Ethical Analysis #7).
- **Open issue to resolve:** Requiring an explicit `confirm` click before `cutoffTime` protects against ghost tables, but could close a valid gathering if a host forgets. We pair it with a reminder 1 hour before cutoff via `Notifying`, and will test in Alpha/Beta whether explicit confirmation feels natural.

---

### 3. Linking

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
- **Pure link resolution separated from `Inviting`:** `Linking` replaces the earlier `LinkSharing` concept and handles *only* capability tokens (`token -> Target`). A single `token` dropped in a dorm list or Slack channel is resolved by many people and is never bound 1-to-1 to user identities.
- **Channel-level revocation:** A host can generate separate labeled links (e.g., `"Next House chat"` and `"6.1040 Slack"`) for the same gathering and revoke one if it spreads too widely.
- **Open issue to resolve:** Currently `revokeAllForTarget` is only needed on spam takedown; ended or cancelled gatherings can remain readable via `Hosting._getDetails` as a closed status page while `Reserving` blocks new reservations.

---

### 4. Inviting

**Purpose:** Record guest acceptances to an event—including tracking pending acceptances by email while a prospective guest verifies their account—so guests can accept seamlessly from a shared link before or after authenticating, without forcing uninterested peers to register just to say no.

**Principle:** An authenticated guest accepts an event directly (and may withdraw later if plans change). When an unauthenticated person accepts using a contact email, a pending acceptance is recorded for that email and event; once they verify their account, the pending acceptance automatically completes as an accepted invitation.

#### Types
```types
external Event
  The gathering or event to which a guest responds.

external Guest
  An authenticated user accepting an event.
```

#### State
```state
a set of Acceptances with
  an Event
  a Guest
  unique event and guest

a set of PendingAcceptances with
  an Event
  a contact String
  unique event and contact
```

#### Actions
```actions
accept(event: Event, guest: Guest) : returns (acceptance: Acceptance)
  where no Acceptance exists for (event, guest)
  then
    add a new acceptance with event and guest
    returns acceptance
  where an Acceptance already exists for (event, guest)
  then
    refuses ALREADY_ACCEPTED "You have already accepted this invitation."

withdraw(event: Event, guest: Guest) : returns ()
  where an Acceptance exists for (event, guest)
  then
    remove the Acceptance for (event, guest)
    returns
  where no Acceptance exists for (event, guest)
  then
    refuses NOT_ACCEPTED "You have not accepted this invitation."

deferAccept(event: Event, contact: String) : returns ()
  where contact is a well-formed email address
  then
    if no PendingAcceptance exists for (event, contact) then add a new pending acceptance with event and contact
    returns
  where contact is not well-formed
  then
    refuses INVALID_CONTACT "Please enter a valid email address."

clearPending(event: Event, contact: String) : returns ()
  where true
  then
    remove any PendingAcceptance with matching event and contact
    returns
```

#### Queries
```queries
_isAccepted(event: Event, guest: Guest) : one (accepted: Flag)
  Returns accepted true if an Acceptance exists for (event, guest); otherwise false.

_getPendingForContact(contact: String) : many (event: Event)
  Returns all events with a PendingAcceptance for contact in unspecified order, or no rows if none exist.
```

#### Note
- **Why there is no `decline` action or declined cookie:** Under a Zoom-link model, uninterested bystanders simply ignore or close the link with zero account creation and zero friction (aligned with keeping non-participants undisturbed). Requiring an account to decline forces bystanders to register, while a browser "declined" cookie breaks across devices and complicates changing one's mind after an accidental click or freed-up evening. Removing an existing `Acceptance` via `withdraw` lets an already-authenticated guest release their spot cleanly while remaining free to re-accept later before cutoff.
- **Why `PendingAcceptances` lives in `Inviting` (tracker pattern):** Before verifying an email code in `Authenticating`, an arriving guest has no `Guest` identity yet—only a `contact` email string. Storing `(event, contact)` in `PendingAcceptances` lets a reaction call `Authenticating.requestCode` and then automatically complete `Inviting.accept` (and thus `Reserving.reserve`) as soon as `Authenticating.verifyCode` returns `(user)`.
- **Separation from `Linking` and `Reserving`:** `Inviting` knows nothing about URL tokens (`Linking`) or seat capacities and waitlists (`Reserving`). `accept` expresses the guest's intent to join; reactions translate `accept` into reserving a seat (or joining the waitlist if full) and translate `withdraw` into releasing any held seat or waitlist spot.
- **Open issue to resolve:** If an unauthenticated user accepts via `deferAccept` while 1 seat remains, and another user claims that seat before they finish verifying their email, `acceptPendingInviteOnVerify` will still accept the invite and automatically place them on the waitlist via `waitlistOnInviteAccept`. We should make sure the post-verification UI clearly states whether they got a confirmed seat or landed #1 on the waitlist, and consider expiring stale `PendingAcceptances` if they never verify.

---

### 5. Reserving

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

### 6. Profiling

**Purpose:** Let participants record their personal dining preferences and restrictions once so fellow table participants can read them when deciding where to eat without repeating the same back-and-forth in chat.

**Principle:** A user sets their dietary restrictions, budget preference, optional walking preference, cuisine tastes, and notes in their profile. Authorized viewers (such as fellow participants at the same table) inspect those profiles to make a qualitative group choice together.

#### Types
```types
external User
  An authenticated user whose dining constraints and preferences are recorded.

DietaryTag is VEGETARIAN or VEGAN or HALAL or KOSHER or GLUTEN_FREE or DAIRY_FREE or NUT_FREE
BudgetTier is FREE or BUDGET or MODERATE or UPSCALE
```

#### State
```state
a set of Profiles with
  a unique User
  a dietaryRestrictions set of DietaryTag
  a budgetPreference BudgetTier
  an optional walkPreferenceMinutes Number
  a cuisinePreferences set of String
  an optional notes String
```

#### Actions
```actions
setProfile(
  user: User,
  dietaryRestrictions: set of DietaryTag,
  budgetPreference: BudgetTier,
  walkPreferenceMinutes?: Number,
  cuisinePreferences: set of String,
  notes?: String
) : returns ()
  where walkPreferenceMinutes is absent or walkPreferenceMinutes > 0
  then
    create or update the profile for user with dietaryRestrictions, budgetPreference, walkPreferenceMinutes, cuisinePreferences, and notes
    returns
  where walkPreferenceMinutes is present and walkPreferenceMinutes <= 0
  then
    refuses INVALID_DISTANCE "Preferred walking time must be positive."

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
  budgetPreference: BudgetTier,
  walkPreferenceMinutes: Number | undefined,
  cuisinePreferences: set of String,
  notes: String | undefined
)
  Returns user's stored profile, or no row if none is set.

_getProfiles(users: set of Users) : many (
  user: User,
  dietaryRestrictions: set of DietaryTag,
  budgetPreference: BudgetTier,
  walkPreferenceMinutes: Number | undefined,
  cuisinePreferences: set of String,
  notes: String | undefined
)
  Returns the stored profile for each user in users who has a Profile, omitting users with no Profile.
```

#### Note
- **Qualitative human judgment instead of deterministic restriction:** Earlier drafts computed a deterministic "most restrictive" minimum budget and walk time across the group. That can falsely rule out options—a student who normally prefers `BUDGET` may happily stretch to `MODERATE` for a holiday dinner. Returning participants' dining profiles via `_getProfiles` lets the host and guests weigh preferences qualitatively (e.g., noticing one halal requirement and a general preference for inexpensive nearby spots) without building any matching or recommendation engine.
- **Privacy boundary (tablemate-scoped vs. public vs. anonymized):** Making profiles fully public to anyone holding a forwarded Zoom link would expose personal dietary, religious, and budget information to casual bystanders; therefore, the `viewTableProfiles` reaction restricts `_getProfiles` to the gathering's host and active reservation holders.
- **Open issue to resolve:** Even within a table, showing named profiles vs. hiding `user` identities (so shy peers like Noah do not feel singled out for a restriction or lower budget) is a clear UX tradeoff. During F6 user testing we will test whether tablemate-scoped profiles should display names (helpful for allergy follow-up) or omit names at the UI layer.

---

### 7. Polling

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
- **Two-option restaurant choice:** `Polling` is used *only* when the host does not select a restaurant at gathering creation (`confirmedVenue` is absent). Whenever a host already has a restaurant in mind, no poll is created or needed.
- **No duplicated deadline state:** Like `Reserving`, `Polling` does not duplicate `Hosting.cutoffTime`; it stays `OPEN` until `closePoll` or `cancelPoll` is invoked by reaction when the gathering hits cutoff or closes.
- **Human-proposed options + approval voting:** `Polling` owns its own `Options` (`label` + optional `note` like `"~$$, halal options"`). Participants read tablemates' dining profiles (`Profiling._getProfiles` via `viewTableProfiles`) and propose/approve options that fit the group; approval voting avoids 1–1–1–1 ties in small groups.
- **Open issue to resolve:** If a poll-enabled gathering reaches `cutoffTime` with zero proposed options, `closePoll` refuses. In Beta we should notify the host ahead of cutoff if no options have been proposed yet.

---

### 8. Notifying

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

The reactions below capture how the eight independent concepts compose to realize Zoom-link creation and resolution, pre-auth invite acceptance with automatic post-verification completion, reservation/waitlist management, poll coordination, and reminder hygiene.

### A. Access Control, Zoom-Link Resolution & Inviting

#### 1. `createGatheringAuthorized` & `createInitialLinkOnCreate`
```
reaction createGatheringAuthorized
when Requesting.createGathering (
  actor, title, startTime, endTime, cutoffTime,
  details, scope, area, confirmedVenue, now
)
where Authenticating: actor is in Users
  and (scope is absent or Authenticating: _hasDomain(actor, scope) is true)
then Hosting.create (
  host: actor, title, startTime, endTime, cutoffTime,
  details, scope, area, confirmedVenue, now
)

reaction createInitialLinkOnCreate
when
  Requesting.createGathering (actor, linkLabel, now)
  Hosting.create () : returns (gathering)
then
  Linking.createLink (target: gathering, creator: actor, label: linkLabel, expiresAt: undefined, now)
```
**Note:** Requires the host to be authenticated (`Authenticating`) and—if they set an institutional `scope` like `"mit.edu"`—verified in that domain themselves (Ethical Analysis #7). Upon creation, `Linking` issues the first shareable link for the host to drop into a chat or email; additional links can be created or revoked via `Linking.createLink` / `Linking.revokeLink`.

#### 2. `viewByLink`
```
reaction viewByLink
when Requesting.viewByLink (token, now)
where Linking: _resolve(token, now) returns (target, link)
then
  Hosting._getDetails (gathering: target)
  Reserving._getAvailability (resource: target)
```
**Note:** Embodies the Zoom-link model: anyone with an active shared `token` can view gathering details (`area`, `confirmedVenue`, terms, live remaining spots) without signing in or having an identity-bound link (Ethical Analysis #3).

#### 3. `acceptByLinkAuthorized` (Authenticated Guest)
```
reaction acceptByLinkAuthorized
when Requesting.acceptByLink (actor, token, now)
where Linking: _resolve(token, now) returns (target, link)
  and Hosting: target is a gathering with status OPEN or CONFIRMED
  and Reserving: pool for target is not locked
  and (Hosting: target's scope is absent or Authenticating: _hasDomain(actor, target's scope) is true)
then Inviting.accept (event: target, guest: actor)
```
**Note:** When an already-authenticated user follows a shared `token` and clicks accept, this reaction checks that the gathering is open and matches any `scope` requirement before recording `Inviting.accept`.

#### 4. `acceptByLinkPendingAuth` & `completePendingInviteOnVerify` (Unauthenticated Guest Flow)
```
reaction acceptByLinkPendingAuth
when Requesting.acceptByLinkWithEmail (email, token, now)
where Linking: _resolve(token, now) returns (target, link)
  and Hosting: target is gathering with status OPEN or CONFIRMED
  and Reserving: pool for target is not locked
then
  Inviting.deferAccept (event: target, contact: email)
  Authenticating.requestCode (email, now)

reaction acceptPendingInviteOnVerify
when Authenticating.verifyCode (email) : returns (user)
where Inviting: event is in _getPendingForContact(contact: email)
  and Hosting: event is a gathering with status OPEN or CONFIRMED
  and Reserving: pool for event is not locked
  and (Hosting: event's scope is absent or Authenticating: _hasDomain(user, event's scope) is true)
then
  Inviting.clearPending (event, contact: email)
  Inviting.accept (event, guest: user)

reaction clearIneligiblePendingOnVerify
when Authenticating.verifyCode (email) : returns (user)
where Inviting: event is in _getPendingForContact(contact: email)
  and (
    Hosting: event's status is not OPEN and not CONFIRMED
    or Reserving: pool for event is locked
    or (Hosting: event's scope is present and Authenticating: _hasDomain(user, event's scope) is false)
  )
then
  Inviting.clearPending (event, contact: email)
```
**Note:** Realizes the two-step pre-authentication acceptance flow. Whether the person has never created an account or is returning on an unauthenticated browser, clicking accept with their email records a pending acceptance in `Inviting` and triggers `Authenticating.requestCode`. As soon as `Authenticating.verifyCode` succeeds, `acceptPendingInviteOnVerify` automatically clears the pending tracker and fires `Inviting.accept` (which triggers seat reservation below); if the gathering closed or their email domain did not match `scope`, `clearIneligiblePendingOnVerify` discards the stale pending entry without calling `accept`. *(Open issue: `requestCode` fires here even if `email` does not match `gathering.scope`; before Beta we can optionally check domain format early at `acceptByLinkWithEmail` for better UX.)*

#### 5. `reserveOrWaitlistOnAccept` & `releaseOnWithdraw`
```
reaction reserveOnInviteAccept
when Inviting.accept (event, guest)
where Reserving: _getAvailability(resource: event) has remaining > 0 and locked is false
then Reserving.reserve (resource: event, user: guest)

reaction waitlistOnInviteAccept
when Inviting.accept (event, guest)
where Reserving: _getAvailability(resource: event) has remaining = 0 and locked is false
then Reserving.joinWaitlist (resource: event, user: guest)

reaction withdrawAuthorized
when Requesting.withdrawInvite (actor, gathering)
where Reserving: pool for gathering is not locked
then Inviting.withdraw (event: gathering, guest: actor)

reaction releaseReservationOnWithdraw
when Inviting.withdraw (event, guest)
where Reserving: reservation is _getReservation(resource: event, user: guest)
then Reserving.cancel (reservation)

reaction leaveWaitlistOnWithdraw
when Inviting.withdraw (event, guest)
where Reserving: _getWaitlistPosition(resource: event, user: guest) is present
then Reserving.leaveWaitlist (resource: event, user: guest)
```
**Note:** Bridges `Inviting` and `Reserving` symmetrically without duplicating seat state inside `Inviting`. Accepting reserves a spot if open or joins the waitlist if full; withdrawing (only available to guests who already accepted) cancels any held reservation or waitlist entry while the pool is unlocked and leaves no persistent declined state blocking re-acceptance.

#### 6. `proposeAndVoteAuthorized`
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

#### 7. `openPoolOnCreate`
```
reaction openPoolOnCreate
when
  Requesting.createGathering (capacity)
  Hosting.create () : returns (gathering)
then
  Reserving.openPool (resource: gathering, capacity)
```
**Note:** Keeps seat-capacity state out of `Hosting` while ensuring every gathering gets a bounded reservation pool.

#### 8. `openPollOnCreate` & `seedInitialOptionsOnCreate`
```
reaction openPollOnCreate
when
  Hosting.create () : returns (gathering)
where Hosting: gathering's confirmedVenue is absent
then
  Polling.openPoll (topic: gathering)

reaction seedInitialOptionsOnCreate
when
  Requesting.createGathering (actor, initialOptions)
  Hosting.create () : returns (gathering)
  Polling.openPoll () : returns (poll)
where Hosting: gathering's confirmedVenue is absent
  and label is in initialOptions
then
  Polling.proposeOption (poll, proposer: actor, label, note: undefined)
```
**Note:** Realizes the two-option restaurant choice cleanly without a separate mode flag: if the host provides `confirmedVenue` at creation (already has a restaurant in mind), `openPollOnCreate` does not fire and no poll is created; if the host leaves `confirmedVenue` unset, `Polling.openPoll` runs automatically so invitees can propose and vote on options (seeded with any optional `initialOptions` the host suggested).

#### 9. `scheduleHostConfirmReminder`
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

#### 10. `handleCutoffAndPollClose`
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
**Note:** Centralizes deadline handling in `Hosting.cutoffTime` so neither `Reserving` nor `Polling` needs its own clock logic. At cutoff, unconfirmed gatherings expire and close, confirmed gatherings lock reservations, and open polls select a winning venue and write it onto `Hosting`.

#### 11. `cleanupOnGatheringStop`
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

#### 12. `scheduleReminderOnReserve`
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

#### 13. `cleanupOnReservationCancel`
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

#### 14. `promoteWaitlistOnCancel`
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
**Note:** Directly solves Bad Situations 2 and 3. When a reservation is cancelled while unlocked, either the spot immediately reopens on existing `Linking` links (if the waitlist is empty) or the next waitlisted peer is promoted, notified, and scheduled for a cutoff reminder—without noisy channel re-blasts.

---

### D. Tablemate Dining Profiles

#### 15. `viewTableProfiles`
```
reaction viewTableProfiles
when Requesting.viewTableProfiles (actor, gathering)
where (Hosting: actor is host of gathering or Reserving: _hasReservation(resource: gathering, user: actor) is true)
  and Hosting: host is gathering's host
  and Reserving: reserved is _getReservedUsers(gathering)
then Profiling._getProfiles (users: {host} union reserved)
```
**Note:** Connects `Profiling` to `Hosting` and `Reserving` so the host and reserved guests can review tablemates' dining preferences qualitatively when proposing and voting on restaurants, while withholding profiles from unreserved link viewers. Whether the UI displays names alongside these profiles or omits names to protect shy participants remains an explicit decision to evaluate in user testing.
