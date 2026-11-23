<!-- Generated from the 6.1040 Team Project assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.2.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.2.0. -->

# 6.1040 Team Project — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

### Authenticating

Defined in [Authenticating](../design/concepts/Authenticating.md), line 1.

#### Actions

- `authenticate(externalId: String, email: String, name?: String, affiliation?: String) : returns (user: User)`
  - Refuses `INVALID_IDENTITY`: A valid external identifier and email address are required.
  - Refuses `EMAIL_CONFLICT`: That email address is already linked to another external identity.
- `beginOidc(returnTo: String, now: DateTime) : returns (state: String)`
  - Refuses `INVALID_RETURN_TO`: Return path must be a relative application path.
- `consumeOidc(state: String, now: DateTime) : returns (returnTo: String)`
  - Refuses `INVALID_STATE`: Login state is invalid or has expired; please try signing in again.
- `verifyOidcCode(code: String) : returns (externalId: String, email: String, name?: String, affiliation?: String)`
  - Refuses `OIDC_EXCHANGE_FAILED`: Could not verify identity with MIT Touchstone via Petrock.

#### Queries

- `_getUser(user: User) : optional (externalId: String, email: String, domain: String, name?: String, affiliation?: String)`
- `_hasDomain(user: User, domain: String) : one (matches: Flag)`

#### Instances

- `Authenticating` — instance of `Authenticating` — [Application Types and Instances](../design/types.md), line 7.

### Hosting

Defined in [Hosting](../design/concepts/Hosting.md), line 1.

#### Actions

- `create(host: Host, title: String, startTime: DateTime, endTime: DateTime, cutoffTime: DateTime, details?: String, scope?: String, area: String, confirmedVenue?: String, now: DateTime) : returns (gathering: Gathering)`
  - Refuses `HOST_LIMIT_REACHED`: You already have the maximum number of active unbooked gatherings.
  - Refuses `INVALID_SCHEDULE`: Gathering requires valid future cutoff, start, and end times.
  - Refuses `INVALID_DETAILS`: A gathering needs a title and an area.
- `confirm(gathering: Gathering, host: Host, now: DateTime) : returns ()`
  - Refuses `NOT_HOST`: Only the gathering's host can confirm it.
  - Refuses `CANNOT_CONFIRM`: This gathering can no longer be confirmed.
- `setVenue(gathering: Gathering, confirmedVenue: String) : returns ()`
- `markBooked(gathering: Gathering, host: Host) : returns ()`
  - Refuses `NOT_HOST`: Only the gathering's host can mark it booked.
  - Refuses `CANNOT_BOOK`: Confirm the gathering and set a venue before marking it booked.
- `cancel(gathering: Gathering, host: Host, now: DateTime) : returns ()`
  - Refuses `NOT_HOST`: Only the gathering's host can cancel this gathering.
  - Refuses `CANNOT_CANCEL`: This gathering has already ended or been cancelled.
- `expireUnconfirmed(gathering: Gathering, now: DateTime) : returns ()`
- `closeEnded(gathering: Gathering, now: DateTime) : returns ()`

#### Queries

- `_getDetails(gathering: Gathering) : optional (host: Host, title: String, status: GatheringStatus, startTime: DateTime, endTime: DateTime, cutoffTime: DateTime, details?: String, scope?: String, area: String, confirmedVenue?: String)`
- `_getHosted(host: Host) : many (gathering: Gathering, title: String, status: GatheringStatus, startTime: DateTime)`
- `_getPastCutoff(now: DateTime) : many (gathering: Gathering, status: GatheringStatus)`

#### Instances

- `Hosting` — instance of `Hosting` — [Application Types and Instances](../design/types.md), line 10.
  - `Host` is `Authenticating.User` — [Application Types and Instances](../design/types.md), line 11.

### Inviting

Defined in [Inviting](../design/concepts/Inviting.md), line 1.

#### Actions

- `accept(event: Event, guest: Guest) : returns (acceptance: Acceptance)`
  - Refuses `ALREADY_ACCEPTED`: You have already accepted this invitation.
- `withdraw(event: Event, guest: Guest) : returns ()`
  - Refuses `NOT_ACCEPTED`: You have not accepted this invitation.
- `deferAccept(event: Event, pendingKey: String) : returns ()`
  - Refuses `INVALID_PENDING_KEY`: A non-empty pending key is required.
- `clearPending(event: Event, pendingKey: String) : returns ()`

#### Queries

- `_isAccepted(event: Event, guest: Guest) : one (accepted: Flag)`
- `_getAcceptedGuests(event: Event) : many (guest: Guest)`
- `_getPendingForKey(pendingKey: String) : many (event: Event)`

#### Instances

- `Inviting` — instance of `Inviting` — [Application Types and Instances](../design/types.md), line 18.
  - `Event` is `Hosting.Gathering` — [Application Types and Instances](../design/types.md), line 19.
  - `Guest` is `Authenticating.User` — [Application Types and Instances](../design/types.md), line 20.

### Linking

Defined in [Linking](../design/concepts/Linking.md), line 1.

#### Actions

- `createLink(target: Target, creator: Creator, label?: String, expiresAt?: DateTime, now: DateTime) : returns (link: Link, token: String)`
  - Refuses `INVALID_EXPIRY`: Link expiration must be in the future.
- `revokeLink(link: Link, creator: Creator) : returns ()`
  - Refuses `NOT_CREATOR`: Only the link creator can revoke this link.
- `revokeAllForTarget(target: Target) : returns ()`

#### Queries

- `_resolve(token: String, now: DateTime) : optional (target: Target, link: Link)`
- `_listForTarget(target: Target) : many (link: Link, token: String, label?: String, active: Flag, expiresAt?: DateTime)`

#### Instances

- `Linking` — instance of `Linking` — [Application Types and Instances](../design/types.md), line 15.
  - `Creator` is `Authenticating.User` — [Application Types and Instances](../design/types.md), line 17.
  - `Target` is `Hosting.Gathering` — [Application Types and Instances](../design/types.md), line 16.

### Reserving

Defined in [Reserving](../design/concepts/Reserving.md), line 1.

#### Actions

- `openPool(resource: Resource, capacity: Number) : returns ()`
  - Refuses `INVALID_POOL`: A reservation pool requires a unique resource and capacity of at least 1.
- `reserve(resource: Resource, user: User) : returns (reservation: Reservation)`
  - Refuses `POOL_CLOSED`: Reservations are locked for this resource.
  - Refuses `ALREADY_RESERVED`: You already hold a reservation for this resource.
  - Refuses `POOL_FULL`: All spots are currently reserved; you may join the waitlist.
- `joinWaitlist(resource: Resource, user: User) : returns ()`
  - Refuses `POOL_CLOSED`: The waitlist is locked for this resource.
  - Refuses `SPOTS_AVAILABLE`: Spots are still open; reserve directly.
  - Refuses `ALREADY_IN_POOL`: You already hold a reservation or waitlist spot.
- `claim(resource: Resource, user: User) : returns (reservation?: Reservation, position?: Number)`
  - Refuses `POOL_CLOSED`: Reservations are locked for this resource.
  - Refuses `ALREADY_IN_POOL`: You already hold a reservation or waitlist spot.
- `cancel(reservation: Reservation) : returns (resource: Resource, user: User, promoted?: User)`
  - Refuses `NO_SUCH_RESERVATION`: Reservation not found.
  - Refuses `CANNOT_CANCEL`: Reservations are locked and can no longer be cancelled.
- `leaveWaitlist(resource: Resource, user: User) : returns ()`
- `lock(resource: Resource) : returns ()`

#### Queries

- `_getAvailability(resource: Resource) : optional (capacity: Number, reservedCount: Number, remaining: Number, waitlistCount: Number, locked: Flag)`
- `_hasReservation(resource: Resource, user: User) : one (reserved: Flag)`
- `_getReservation(resource: Resource, user: User) : optional (reservation: Reservation)`
- `_getReservedUsers(resource: Resource) : many (user: User)`
- `_getWaitlistPosition(resource: Resource, user: User) : optional (position: Number)`

#### Instances

- `Reserving` — instance of `Reserving` — [Application Types and Instances](../design/types.md), line 12.
  - `Resource` is `Hosting.Gathering` — [Application Types and Instances](../design/types.md), line 13.
  - `User` is `Authenticating.User` — [Application Types and Instances](../design/types.md), line 14.

### Sessioning

Defined in [Sessioning](../design/concepts/Sessioning.md), line 1.

#### Actions

- `start(subject: Subject, lifetime: Number, now: DateTime) : returns (session: Session, expiresAt: DateTime)`
  - Refuses `INVALID_SESSION_LIFETIME`: A session lifetime must be a positive number of milliseconds.
- `current(session: Session, now: DateTime) : returns (subject: Subject)`
  - Refuses `UNKNOWN_SESSION`: This session is not active.
- `end(session: Session, now: DateTime) : returns (ended: Flag)`
  - Refuses `UNKNOWN_SESSION`: This session is not active.

#### Queries

- `_active(session: Session, now: DateTime) : optional (subject: Subject, expiresAt: DateTime)`

#### Instances

- `Sessioning` — instance of `Sessioning` — [Application Types and Instances](../design/types.md), line 8.
  - `Subject` is `Authenticating.User` — [Application Types and Instances](../design/types.md), line 9.

## Computations

- `buildPetrockAuthUrl(state: String) : String` — [Auth](../design/compositions/Auth.md), line 39.
- `hasSession(session?: String) : Flag` — [Auth](../design/compositions/Auth.md), line 33.
- `hasText(value?: String) : Flag` — [Tables](../design/compositions/Tables.md), line 51.
- `isAcceptingGuests(status: String, locked: Flag, cutoffTime: DateTime, now: DateTime) : Flag` — [Tables](../design/compositions/Tables.md), line 57.
- `isValidCapacity(capacity?: Number) : Flag` — [Tables](../design/compositions/Tables.md), line 54.
- `normalizeReturnTo(raw?: String) : String` — [Auth](../design/compositions/Auth.md), line 36.
- `now() : DateTime` — [Auth](../design/compositions/Auth.md), line 27.
- `parseTime(raw: String) : DateTime` — [Gatherings](../design/compositions/Gatherings.md), line 29.
- `sessionLifetimeMs() : Number` — [Auth](../design/compositions/Auth.md), line 30.
- `testAccountAffiliation(account?: String) : String` — [Auth](../design/compositions/Auth.md), line 54.
- `testAccountEmail(account?: String) : String` — [Auth](../design/compositions/Auth.md), line 48.
- `testAccountExternalId(account?: String) : String` — [Auth](../design/compositions/Auth.md), line 45.
- `testAccountName(account?: String) : String` — [Auth](../design/compositions/Auth.md), line 51.
- `testLoginEnabled() : Flag` — [Auth](../design/compositions/Auth.md), line 42.

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

### a guest's place at a table

Authored path: `Tables.Joining.GuestPlace`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 32.

```former
Former "a guest's place at a table" — inputs (gathering, guest); bindings (reservation, position); promises exactly one record — forms:
  a record of
    where whether Reserving._getReservation (resource: gathering, user: guest) has (reservation)
    where whether Reserving._getWaitlistPosition (resource: gathering, user: guest) has (position)
    position
    reservation
```

### a table's links

Authored path: `Tables.Sharing.TableLinks`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.

```former
Former "a table's links" — inputs (gathering); bindings (link, token, label, active, expiresAt); promises exactly one record — forms:
  a record of
    links: each Linking._listForTarget (target: gathering) has (active, expiresAt, label, link, token)
      form a record of
        active
        expiresAt
        label
        link
        token
```

### the gatherings hosted by (host)

Authored path: `Gatherings.Viewing.Hosted`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 9.

```former
Former "the gatherings hosted by (host)" — inputs (host); bindings (gathering, title, status, startTime); promises exactly one record — forms:
  a record of
    tables: each Hosting._getHosted (host) has (gathering, startTime, status, title)
      form a record of
        gathering
        startTime
        status
        title
```

### the host's tables

Authored path: `Tables.Hosting.HostedTables`.
- Covered by [Tables](../design/compositions/Tables.md), line 9.

```former
Former "the host's tables" — inputs (host); bindings (gathering, title, status, startTime); promises exactly one record — forms:
  a record of
    tables: each Hosting._getHosted (host) has (gathering, startTime, status, title)
      form a record of
        gathering
        startTime
        status
        title
```

## Reactions

### Auth.Demo.TestLogin

Authored path: `Auth.Demo.TestLogin`.
- Covered by [Auth](../design/compositions/Auth.md), line 11.
- Covered by [Auth](../design/compositions/Auth.md), line 20.

```reaction
when RequestBoundary.request (account, path: "/auth/test-login", requestId, returnTo)
where
  enabled is testLoginEnabled
  enabled is among [true]
  now is now
  lifetime is sessionLifetimeMs
  safeReturnTo is normalizeReturnTo (raw: returnTo)
  externalId is testAccountExternalId (account)
  email is testAccountEmail (account)
  name is testAccountName (account)
  affiliation is testAccountAffiliation (account)
then
  Authenticating.authenticate (affiliation, email, externalId, name)
```

### Auth.Demo.TestLogin#2

Authored path: `Auth.Demo.TestLogin`.
- Covered by [Auth](../design/compositions/Auth.md), line 11.
- Covered by [Auth](../design/compositions/Auth.md), line 20.

```reaction
when Authenticating.authenticate (affiliation, email, externalId, name, user), asked by Auth.Demo.TestLogin
where
  Authenticating._getUser (user) has (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName)
  now is now
  lifetime is sessionLifetimeMs
then
  Sessioning.start (lifetime, now, subject: user)
```

### Auth.Demo.TestLogin#3

Authored path: `Auth.Demo.TestLogin`.
- Covered by [Auth](../design/compositions/Auth.md), line 11.
- Covered by [Auth](../design/compositions/Auth.md), line 20.

```reaction
when Sessioning.start (lifetime, now, subject: user, session), asked by Auth.Demo.TestLogin#2
where
  Authenticating._getUser (user) has (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName)
  earlier, RequestBoundary.request (account, path: "/auth/test-login", requestId, returnTo)
  safeReturnTo is normalizeReturnTo (raw: returnTo)
then
  RequestBoundary.respond (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName, requestId, returnTo: safeReturnTo, session, user)
```

### Auth.Demo.TestLoginDisabled

Authored path: `Auth.Demo.TestLoginDisabled`.
- Covered by [Auth](../design/compositions/Auth.md), line 11.
- Covered by [Auth](../design/compositions/Auth.md), line 21.

```reaction
when RequestBoundary.request (path: "/auth/test-login", requestId, returnTo)
where
  enabled is testLoginEnabled
  enabled is among [false]
then
  RequestBoundary.respond (error: "TEST_LOGIN_DISABLED", requestId)
```

### Auth.Petrock.Callback

Authored path: `Auth.Petrock.Callback`.
- Covered by [Auth](../design/compositions/Auth.md), line 7.
- Covered by [Auth](../design/compositions/Auth.md), line 19.

```reaction
when RequestBoundary.request (code, path: "/auth/petrock/callback", requestId, state)
where
  now is now
  lifetime is sessionLifetimeMs
then
  Authenticating.consumeOidc (now, state)
```

### Auth.Petrock.Callback#2

Authored path: `Auth.Petrock.Callback`.
- Covered by [Auth](../design/compositions/Auth.md), line 7.
- Covered by [Auth](../design/compositions/Auth.md), line 19.

```reaction
when Authenticating.consumeOidc (now, state, returnTo), asked by Auth.Petrock.Callback
where
  earlier, RequestBoundary.request (code, path: "/auth/petrock/callback", requestId, state)
then
  Authenticating.verifyOidcCode (code)
```

### Auth.Petrock.Callback#3

Authored path: `Auth.Petrock.Callback`.
- Covered by [Auth](../design/compositions/Auth.md), line 7.
- Covered by [Auth](../design/compositions/Auth.md), line 19.

```reaction
when Authenticating.verifyOidcCode (code, affiliation, email, externalId, name), asked by Auth.Petrock.Callback#2
then
  Authenticating.authenticate (affiliation, email, externalId, name)
```

### Auth.Petrock.Callback#4

Authored path: `Auth.Petrock.Callback`.
- Covered by [Auth](../design/compositions/Auth.md), line 7.
- Covered by [Auth](../design/compositions/Auth.md), line 19.

```reaction
when Authenticating.authenticate (affiliation, email, externalId, name, user), asked by Auth.Petrock.Callback#3
where
  Authenticating._getUser (user) has (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName)
  earlier, Authenticating.consumeOidc (now, state, returnTo), asked by Auth.Petrock.Callback
  lifetime is sessionLifetimeMs
then
  Sessioning.start (lifetime, now, subject: user)
```

### Auth.Petrock.Callback#5

Authored path: `Auth.Petrock.Callback`.
- Covered by [Auth](../design/compositions/Auth.md), line 7.
- Covered by [Auth](../design/compositions/Auth.md), line 19.

```reaction
when Sessioning.start (lifetime, now, subject: user, session), asked by Auth.Petrock.Callback#4
where
  Authenticating._getUser (user) has (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName)
  earlier, Authenticating.consumeOidc (now, state, returnTo), asked by Auth.Petrock.Callback
  earlier, RequestBoundary.request (code, path: "/auth/petrock/callback", requestId, state)
then
  RequestBoundary.respond (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName, requestId, returnTo, session, user)
```

### Auth.Petrock.Start

Authored path: `Auth.Petrock.Start`.
- Covered by [Auth](../design/compositions/Auth.md), line 5.
- Covered by [Auth](../design/compositions/Auth.md), line 18.

```reaction
when RequestBoundary.request (path: "/auth/petrock/start", requestId, returnTo)
where
  now is now
  safeReturnTo is normalizeReturnTo (raw: returnTo)
then
  Authenticating.beginOidc (now, returnTo: safeReturnTo)
```

### Auth.Petrock.Start#2

Authored path: `Auth.Petrock.Start`.
- Covered by [Auth](../design/compositions/Auth.md), line 5.
- Covered by [Auth](../design/compositions/Auth.md), line 18.

```reaction
when Authenticating.beginOidc (now, returnTo: safeReturnTo, state), asked by Auth.Petrock.Start
where
  authorizationUrl is buildPetrockAuthUrl (state)
  earlier, RequestBoundary.request (path: "/auth/petrock/start", requestId, returnTo)
then
  RequestBoundary.respond (authorizationUrl, requestId)
```

### Auth.Session.Logout

Authored path: `Auth.Session.Logout`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 23.

```reaction
when RequestBoundary.request (path: "/auth/logout", requestId, session)
where
  now is now
then
  Sessioning.end (now, session)
```

### Auth.Session.Logout#2

Authored path: `Auth.Session.Logout`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 23.

```reaction
when Sessioning.end (now, session, ended), asked by Auth.Session.Logout
where
  earlier, RequestBoundary.request (path: "/auth/logout", requestId, session)
then
  RequestBoundary.respond (ended, requestId)
```

### Auth.Session.Me:authenticated

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 22.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [true]
  testLoginEnabled is testLoginEnabled
  now is now
  Sessioning._active (now, session) has (subject: user)
  Authenticating._getUser (user) has (affiliation, domain, email, name)
then
  RequestBoundary.respond (affiliation, authenticated: true, domain, email, name, requestId, testLoginEnabled, user)
```

### Auth.Session.Me:session-inactive

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 22.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [true]
  testLoginEnabled is testLoginEnabled
  now is now
  no Sessioning._active (now, session)
then
  RequestBoundary.respond (authenticated: false, requestId, testLoginEnabled)
```

### Auth.Session.Me:session-missing

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 22.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [false]
  testLoginEnabled is testLoginEnabled
then
  RequestBoundary.respond (authenticated: false, requestId, testLoginEnabled)
```

### Auth.Session.Me:user-missing

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 22.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [true]
  testLoginEnabled is testLoginEnabled
  now is now
  Sessioning._active (now, session) has (subject: user)
  no Authenticating._getUser (user)
then
  RequestBoundary.respond (authenticated: false, requestId, testLoginEnabled)
```

### DeliverFaultToAsker

```reaction
when any action is faulted, not asked by DeliverFaultToAsker
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respondFramework (error: "INTERNAL_ERROR", requestId)
```

### DeliverRefusalToAsker

```reaction
when any action is refused (message), except RequestBoundary
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respond (error: message, requestId)
```

### Gatherings.Creating.Create

Authored path: `Gatherings.Creating.Create`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 20.

```reaction
when RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, path: "/gatherings/create", requestId, session, startTime, title)
where
  now is now
  start is parseTime (raw: startTime)
  end is parseTime (raw: endTime)
  cutoff is parseTime (raw: cutoffTime)
then
  Sessioning.current (now, session)
```

### Gatherings.Creating.Create#2

Authored path: `Gatherings.Creating.Create`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 20.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Creating.Create
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, path: "/gatherings/create", requestId, session, startTime, title)
  start is parseTime (raw: startTime)
  end is parseTime (raw: endTime)
  cutoff is parseTime (raw: cutoffTime)
then
  Hosting.create (area, confirmedVenue, cutoffTime: cutoff, details, endTime: end, host: user, now, startTime: start, title)
```

### Gatherings.Creating.Create#3

Authored path: `Gatherings.Creating.Create`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 20.

```reaction
when Hosting.create (area, confirmedVenue, cutoffTime: cutoff, details, endTime: end, host: user, now, startTime: start, title, gathering), asked by Gatherings.Creating.Create#2
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, path: "/gatherings/create", requestId, session, startTime, title)
then
  Reserving.openPool (capacity, resource: gathering)
```

### Gatherings.Creating.Create#4

Authored path: `Gatherings.Creating.Create`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 20.

```reaction
when Reserving.openPool (capacity, resource: gathering), asked by Gatherings.Creating.Create#3
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, path: "/gatherings/create", requestId, session, startTime, title)
then
  RequestBoundary.respond (gathering, requestId)
```

### Gatherings.Managing.Cancel

Authored path: `Gatherings.Managing.Cancel`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 25.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/cancel", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Gatherings.Managing.Cancel#2

Authored path: `Gatherings.Managing.Cancel`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 25.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Managing.Cancel
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/cancel", requestId, session)
then
  Hosting.cancel (gathering, host: user, now)
```

### Gatherings.Managing.Cancel#3

Authored path: `Gatherings.Managing.Cancel`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 25.

```reaction
when Hosting.cancel (gathering, host: user, now), asked by Gatherings.Managing.Cancel#2
then
  Reserving.lock (resource: gathering)
```

### Gatherings.Managing.Cancel#4

Authored path: `Gatherings.Managing.Cancel`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 25.

```reaction
when Reserving.lock (resource: gathering), asked by Gatherings.Managing.Cancel#3
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/cancel", requestId, session)
then
  RequestBoundary.respond (requestId)
```

### Gatherings.Managing.Confirm

Authored path: `Gatherings.Managing.Confirm`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 23.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/confirm", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Gatherings.Managing.Confirm#2

Authored path: `Gatherings.Managing.Confirm`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 23.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Managing.Confirm
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/confirm", requestId, session)
then
  Hosting.confirm (gathering, host: user, now)
```

### Gatherings.Managing.Confirm#3

Authored path: `Gatherings.Managing.Confirm`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 23.

```reaction
when Hosting.confirm (gathering, host: user, now), asked by Gatherings.Managing.Confirm#2
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/confirm", requestId, session)
then
  RequestBoundary.respond (requestId)
```

### Gatherings.Managing.MarkBooked

Authored path: `Gatherings.Managing.MarkBooked`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 24.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/book", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Gatherings.Managing.MarkBooked#2

Authored path: `Gatherings.Managing.MarkBooked`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 24.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Managing.MarkBooked
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/book", requestId, session)
then
  Hosting.markBooked (gathering, host: user)
```

### Gatherings.Managing.MarkBooked#3

Authored path: `Gatherings.Managing.MarkBooked`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 17.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 24.

```reaction
when Hosting.markBooked (gathering, host: user), asked by Gatherings.Managing.MarkBooked#2
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/book", requestId, session)
then
  RequestBoundary.respond (requestId)
```

### Gatherings.Viewing.Mine

Authored path: `Gatherings.Viewing.Mine`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 9.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 21.

```reaction
when RequestBoundary.request (path: "/gatherings/mine", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Gatherings.Viewing.Mine#2

Authored path: `Gatherings.Viewing.Mine`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 9.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 21.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Viewing.Mine
where
  earlier, RequestBoundary.request (path: "/gatherings/mine", requestId, session)
then
  RequestBoundary.respond (hosted: former "the gatherings hosted by (host)" with (host: user), requestId)
```

### Gatherings.Viewing.View

Authored path: `Gatherings.Viewing.View`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 11.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 22.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/view", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Gatherings.Viewing.View:no-pool#2

Authored path: `Gatherings.Viewing.View`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 11.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 22.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Viewing.View
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/view", requestId, session)
  Hosting._getDetails (gathering) has (host: user)
  no Reserving._getAvailability (resource: gathering)
then
  RequestBoundary.respond (error: "NO_SUCH_TABLE", requestId)
```

### Gatherings.Viewing.View:not-own-table#2

Authored path: `Gatherings.Viewing.View`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 11.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 22.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Viewing.View
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/view", requestId, session)
  no Hosting._getDetails (gathering) has (host: user)
then
  RequestBoundary.respond (error: "NO_SUCH_TABLE", requestId)
```

### Gatherings.Viewing.View:own-table#2

Authored path: `Gatherings.Viewing.View`.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 11.
- Covered by [Gatherings](../design/compositions/Gatherings.md), line 22.

```reaction
when Sessioning.current (now, session, subject: user), asked by Gatherings.Viewing.View
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/view", requestId, session)
  Hosting._getDetails (gathering) has (area, confirmedVenue, cutoffTime, details, endTime, host: user, startTime, status, title)
  Reserving._getAvailability (resource: gathering) has (capacity, locked, remaining, reservedCount, waitlistCount)
then
  RequestBoundary.respond (area, capacity, confirmedVenue, cutoffTime, details, endTime, locked, remaining, requestId, reservedCount, startTime, status, title, waitlistCount)
```

### Tables.Hosting.CreateTable

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Hosting.CreateTable:host-in-scope#2

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Hosting.CreateTable
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
  capacityOk is isValidCapacity (capacity)
  capacityOk is among [true]
  scoped is hasText (value: scope)
  scoped is among [true]
  Authenticating._hasDomain (domain: scope, user: host) has (matches)
  matches is among [true]
  start is parseTime (raw: startTime)
  end is parseTime (raw: endTime)
  cutoff is parseTime (raw: cutoffTime)
then
  Hosting.create (area, confirmedVenue, cutoffTime: cutoff, details, endTime: end, host, now, scope, startTime: start, title)
```

### Tables.Hosting.CreateTable:host-in-scope#3

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Hosting.create (area, confirmedVenue, cutoffTime: cutoff, details, endTime: end, host, now, scope, startTime: start, title, gathering), asked by Tables.Hosting.CreateTable:host-in-scope#2
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
then
  Reserving.openPool (capacity, resource: gathering)
```

### Tables.Hosting.CreateTable:host-in-scope#4

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Reserving.openPool (capacity, resource: gathering), asked by Tables.Hosting.CreateTable:host-in-scope#3
where
  earlier, Sessioning.current (now, session, subject: host), asked by Tables.Hosting.CreateTable
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
then
  Linking.createLink (creator: host, label: linkLabel, now, target: gathering)
```

### Tables.Hosting.CreateTable:host-in-scope#5

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Linking.createLink (creator: host, label: linkLabel, now, target: gathering, link, token), asked by Tables.Hosting.CreateTable:host-in-scope#4
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
then
  RequestBoundary.respond (gathering, link, requestId, token)
```

### Tables.Hosting.CreateTable:host-out-of-scope#2

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Hosting.CreateTable
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
  capacityOk is isValidCapacity (capacity)
  capacityOk is among [true]
  scoped is hasText (value: scope)
  scoped is among [true]
  Authenticating._hasDomain (domain: scope, user: host) has (matches)
  matches is among [false]
then
  RequestBoundary.respond (error: "SCOPE_MISMATCH", requestId)
```

### Tables.Hosting.CreateTable:invalid-capacity#2

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Hosting.CreateTable
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
  capacityOk is isValidCapacity (capacity)
  capacityOk is among [false]
then
  RequestBoundary.respond (error: "INVALID_CAPACITY", requestId)
```

### Tables.Hosting.CreateTable:open-to-anyone#2

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Hosting.CreateTable
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
  capacityOk is isValidCapacity (capacity)
  capacityOk is among [true]
  scoped is hasText (value: scope)
  scoped is among [false]
  start is parseTime (raw: startTime)
  end is parseTime (raw: endTime)
  cutoff is parseTime (raw: cutoffTime)
then
  Hosting.create (area, confirmedVenue, cutoffTime: cutoff, details, endTime: end, host, now, scope, startTime: start, title)
```

### Tables.Hosting.CreateTable:open-to-anyone#3

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Hosting.create (area, confirmedVenue, cutoffTime: cutoff, details, endTime: end, host, now, scope, startTime: start, title, gathering), asked by Tables.Hosting.CreateTable:open-to-anyone#2
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
then
  Reserving.openPool (capacity, resource: gathering)
```

### Tables.Hosting.CreateTable:open-to-anyone#4

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Reserving.openPool (capacity, resource: gathering), asked by Tables.Hosting.CreateTable:open-to-anyone#3
where
  earlier, Sessioning.current (now, session, subject: host), asked by Tables.Hosting.CreateTable
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
then
  Linking.createLink (creator: host, label: linkLabel, now, target: gathering)
```

### Tables.Hosting.CreateTable:open-to-anyone#5

Authored path: `Tables.Hosting.CreateTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 5.
- Covered by [Tables](../design/compositions/Tables.md), line 12.

```reaction
when Linking.createLink (creator: host, label: linkLabel, now, target: gathering, link, token), asked by Tables.Hosting.CreateTable:open-to-anyone#4
where
  earlier, RequestBoundary.request (area, capacity, confirmedVenue, cutoffTime, details, endTime, linkLabel, path: "/api/tables/create", requestId, scope, session, startTime, title)
then
  RequestBoundary.respond (gathering, link, requestId, token)
```

### Tables.Hosting.MyTables

Authored path: `Tables.Hosting.MyTables`.
- Covered by [Tables](../design/compositions/Tables.md), line 9.
- Covered by [Tables](../design/compositions/Tables.md), line 13.

```reaction
when RequestBoundary.request (path: "/api/tables/mine", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Hosting.MyTables#2

Authored path: `Tables.Hosting.MyTables`.
- Covered by [Tables](../design/compositions/Tables.md), line 9.
- Covered by [Tables](../design/compositions/Tables.md), line 13.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Hosting.MyTables
where
  earlier, RequestBoundary.request (path: "/api/tables/mine", requestId, session)
then
  RequestBoundary.respond (hosted: former "the host's tables" with (host), requestId)
```

### Tables.Joining.AcceptTable

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Joining.AcceptTable:guest-in-scope#2

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.AcceptTable
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
  Linking._resolve (now, token) has (target: gathering)
  no Hosting._getDetails (gathering) has (host: guest)
  Hosting._getDetails (gathering) has (cutoffTime, status)
  Reserving._getAvailability (resource: gathering) has (locked)
  accepting is isAcceptingGuests (cutoffTime, locked, now, status)
  accepting is among [true]
  Hosting._getDetails (gathering) has (scope)
  scoped is hasText (value: scope)
  scoped is among [true]
  Authenticating._hasDomain (domain: scope, user: guest) has (matches)
  matches is among [true]
then
  Inviting.accept (event: gathering, guest)
```

### Tables.Joining.AcceptTable:guest-in-scope#3

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Inviting.accept (event: gathering, guest), asked by Tables.Joining.AcceptTable:guest-in-scope#2
then
  Reserving.claim (resource: gathering, user: guest)
```

### Tables.Joining.AcceptTable:guest-in-scope#4

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Reserving.claim (resource: gathering, user: guest), asked by Tables.Joining.AcceptTable:guest-in-scope#3
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
then
  RequestBoundary.respond (gathering, place: former "a guest's place at a table" with (gathering, guest), requestId)
```

### Tables.Joining.AcceptTable:guest-out-of-scope#2

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.AcceptTable
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
  Linking._resolve (now, token) has (target: gathering)
  no Hosting._getDetails (gathering) has (host: guest)
  Hosting._getDetails (gathering) has (cutoffTime, status)
  Reserving._getAvailability (resource: gathering) has (locked)
  accepting is isAcceptingGuests (cutoffTime, locked, now, status)
  accepting is among [true]
  Hosting._getDetails (gathering) has (scope)
  scoped is hasText (value: scope)
  scoped is among [true]
  Authenticating._hasDomain (domain: scope, user: guest) has (matches)
  matches is among [false]
then
  RequestBoundary.respond (error: "SCOPE_MISMATCH", requestId)
```

### Tables.Joining.AcceptTable:link-unknown#2

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.AcceptTable
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
  no Linking._resolve (now, token)
then
  RequestBoundary.respond (error: "LINK_NOT_FOUND", requestId)
```

### Tables.Joining.AcceptTable:open-to-anyone#2

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.AcceptTable
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
  Linking._resolve (now, token) has (target: gathering)
  no Hosting._getDetails (gathering) has (host: guest)
  Hosting._getDetails (gathering) has (cutoffTime, status)
  Reserving._getAvailability (resource: gathering) has (locked)
  accepting is isAcceptingGuests (cutoffTime, locked, now, status)
  accepting is among [true]
  Hosting._getDetails (gathering) has (scope)
  scoped is hasText (value: scope)
  scoped is among [false]
then
  Inviting.accept (event: gathering, guest)
```

### Tables.Joining.AcceptTable:open-to-anyone#3

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Inviting.accept (event: gathering, guest), asked by Tables.Joining.AcceptTable:open-to-anyone#2
then
  Reserving.claim (resource: gathering, user: guest)
```

### Tables.Joining.AcceptTable:open-to-anyone#4

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Reserving.claim (resource: gathering, user: guest), asked by Tables.Joining.AcceptTable:open-to-anyone#3
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
then
  RequestBoundary.respond (gathering, place: former "a guest's place at a table" with (gathering, guest), requestId)
```

### Tables.Joining.AcceptTable:own-table#2

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.AcceptTable
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
  Linking._resolve (now, token) has (target: gathering)
  Hosting._getDetails (gathering) has (host: guest)
then
  RequestBoundary.respond (error: "OWN_TABLE", requestId)
```

### Tables.Joining.AcceptTable:table-closed#2

Authored path: `Tables.Joining.AcceptTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 26.
- Covered by [Tables](../design/compositions/Tables.md), line 35.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.AcceptTable
where
  earlier, RequestBoundary.request (path: "/api/tables/accept", requestId, session, token)
  Linking._resolve (now, token) has (target: gathering)
  no Hosting._getDetails (gathering) has (host: guest)
  Hosting._getDetails (gathering) has (cutoffTime, status)
  Reserving._getAvailability (resource: gathering) has (locked)
  accepting is isAcceptingGuests (cutoffTime, locked, now, status)
  accepting is among [false]
then
  RequestBoundary.respond (error: "TABLE_CLOSED", requestId)
```

### Tables.Joining.MyPlace

Authored path: `Tables.Joining.MyPlace`.
- Covered by [Tables](../design/compositions/Tables.md), line 32.
- Covered by [Tables](../design/compositions/Tables.md), line 37.

```reaction
when RequestBoundary.request (gathering, path: "/api/tables/place", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Joining.MyPlace:host#2

Authored path: `Tables.Joining.MyPlace`.
- Covered by [Tables](../design/compositions/Tables.md), line 32.
- Covered by [Tables](../design/compositions/Tables.md), line 37.

```reaction
when Sessioning.current (now, session, subject: viewer), asked by Tables.Joining.MyPlace
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/place", requestId, session)
  Hosting._getDetails (gathering) has (host: viewer)
then
  RequestBoundary.respond (hosting: true, place: former "a guest's place at a table" with (gathering, guest: viewer), requestId)
```

### Tables.Joining.MyPlace:not-host#2

Authored path: `Tables.Joining.MyPlace`.
- Covered by [Tables](../design/compositions/Tables.md), line 32.
- Covered by [Tables](../design/compositions/Tables.md), line 37.

```reaction
when Sessioning.current (now, session, subject: viewer), asked by Tables.Joining.MyPlace
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/place", requestId, session)
  no Hosting._getDetails (gathering) has (host: viewer)
then
  RequestBoundary.respond (hosting: false, place: former "a guest's place at a table" with (gathering, guest: viewer), requestId)
```

### Tables.Joining.WithdrawTable

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Joining.WithdrawTable:holding-nothing#2

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.WithdrawTable
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
  no Reserving._getReservation (resource: gathering, user: guest)
  no Reserving._getWaitlistPosition (resource: gathering, user: guest)
then
  Inviting.withdraw (event: gathering, guest)
```

### Tables.Joining.WithdrawTable:holding-nothing#3

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Inviting.withdraw (event: gathering, guest), asked by Tables.Joining.WithdrawTable:holding-nothing#2
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
then
  RequestBoundary.respond (requestId, withdrawn: true)
```

### Tables.Joining.WithdrawTable:seated#2

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.WithdrawTable
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
  Reserving._getReservation (resource: gathering, user: guest) has (reservation)
then
  Reserving.cancel (reservation)
```

### Tables.Joining.WithdrawTable:seated#3

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Reserving.cancel (reservation), asked by Tables.Joining.WithdrawTable:seated#2
where
  earlier, Sessioning.current (now, session, subject: guest), asked by Tables.Joining.WithdrawTable
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
then
  Inviting.withdraw (event: gathering, guest)
```

### Tables.Joining.WithdrawTable:seated#4

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Inviting.withdraw (event: gathering, guest), asked by Tables.Joining.WithdrawTable:seated#3
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
then
  RequestBoundary.respond (requestId, withdrawn: true)
```

### Tables.Joining.WithdrawTable:waitlist-locked#2

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.WithdrawTable
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
  Reserving._getWaitlistPosition (resource: gathering, user: guest)
  Reserving._getAvailability (resource: gathering) has (locked)
  locked is among [true]
then
  RequestBoundary.respond (error: "TABLE_CLOSED", requestId)
```

### Tables.Joining.WithdrawTable:waitlisted#2

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Sessioning.current (now, session, subject: guest), asked by Tables.Joining.WithdrawTable
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
  Reserving._getWaitlistPosition (resource: gathering, user: guest)
  Reserving._getAvailability (resource: gathering) has (locked)
  locked is among [false]
then
  Reserving.leaveWaitlist (resource: gathering, user: guest)
```

### Tables.Joining.WithdrawTable:waitlisted#3

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Reserving.leaveWaitlist (resource: gathering, user: guest), asked by Tables.Joining.WithdrawTable:waitlisted#2
then
  Inviting.withdraw (event: gathering, guest)
```

### Tables.Joining.WithdrawTable:waitlisted#4

Authored path: `Tables.Joining.WithdrawTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 28.
- Covered by [Tables](../design/compositions/Tables.md), line 36.

```reaction
when Inviting.withdraw (event: gathering, guest), asked by Tables.Joining.WithdrawTable:waitlisted#3
where
  earlier, RequestBoundary.request (gathering, path: "/api/tables/withdraw", requestId, session)
then
  RequestBoundary.respond (requestId, withdrawn: true)
```

### Tables.Sharing.CreateLink

Authored path: `Tables.Sharing.CreateLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 45.

```reaction
when RequestBoundary.request (gathering, label, path: "/api/links/create", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Sharing.CreateLink:is-host#2

Authored path: `Tables.Sharing.CreateLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 45.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Sharing.CreateLink
where
  earlier, RequestBoundary.request (gathering, label, path: "/api/links/create", requestId, session)
  Hosting._getDetails (gathering) has (host)
then
  Linking.createLink (creator: host, label, now, target: gathering)
```

### Tables.Sharing.CreateLink:is-host#3

Authored path: `Tables.Sharing.CreateLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 45.

```reaction
when Linking.createLink (creator: host, label, now, target: gathering, link, token), asked by Tables.Sharing.CreateLink:is-host#2
where
  earlier, RequestBoundary.request (gathering, label, path: "/api/links/create", requestId, session)
then
  RequestBoundary.respond (link, requestId, token)
```

### Tables.Sharing.CreateLink:not-host#2

Authored path: `Tables.Sharing.CreateLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 45.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Sharing.CreateLink
where
  earlier, RequestBoundary.request (gathering, label, path: "/api/links/create", requestId, session)
  no Hosting._getDetails (gathering) has (host)
then
  RequestBoundary.respond (error: "NOT_HOST", requestId)
```

### Tables.Sharing.ListLinks

Authored path: `Tables.Sharing.ListLinks`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 46.

```reaction
when RequestBoundary.request (gathering, path: "/api/links/list", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Sharing.ListLinks:is-host#2

Authored path: `Tables.Sharing.ListLinks`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 46.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Sharing.ListLinks
where
  earlier, RequestBoundary.request (gathering, path: "/api/links/list", requestId, session)
  Hosting._getDetails (gathering) has (host)
then
  RequestBoundary.respond (requestId, shared: former "a table's links" with (gathering))
```

### Tables.Sharing.ListLinks:not-host#2

Authored path: `Tables.Sharing.ListLinks`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 46.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Sharing.ListLinks
where
  earlier, RequestBoundary.request (gathering, path: "/api/links/list", requestId, session)
  no Hosting._getDetails (gathering) has (host)
then
  RequestBoundary.respond (error: "NOT_HOST", requestId)
```

### Tables.Sharing.RevokeLink

Authored path: `Tables.Sharing.RevokeLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 47.

```reaction
when RequestBoundary.request (link, path: "/api/links/revoke", requestId, session)
where
  now is now
then
  Sessioning.current (now, session)
```

### Tables.Sharing.RevokeLink#2

Authored path: `Tables.Sharing.RevokeLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 47.

```reaction
when Sessioning.current (now, session, subject: host), asked by Tables.Sharing.RevokeLink
where
  earlier, RequestBoundary.request (link, path: "/api/links/revoke", requestId, session)
then
  Linking.revokeLink (creator: host, link)
```

### Tables.Sharing.RevokeLink#3

Authored path: `Tables.Sharing.RevokeLink`.
- Covered by [Tables](../design/compositions/Tables.md), line 42.
- Covered by [Tables](../design/compositions/Tables.md), line 47.

```reaction
when Linking.revokeLink (creator: host, link), asked by Tables.Sharing.RevokeLink#2
where
  earlier, RequestBoundary.request (link, path: "/api/links/revoke", requestId, session)
then
  RequestBoundary.respond (requestId, revoked: true)
```

### Tables.Viewing.ViewTable:link-active

Authored path: `Tables.Viewing.ViewTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 18.
- Covered by [Tables](../design/compositions/Tables.md), line 21.

```reaction
when RequestBoundary.request (path: "/api/tables/view", requestId, token)
where
  now is now
  Linking._resolve (now, token) has (target: gathering)
  Hosting._getDetails (gathering) has (area, confirmedVenue, cutoffTime, details, endTime, scope, startTime, status, title)
  Reserving._getAvailability (resource: gathering) has (capacity, locked, remaining, reservedCount, waitlistCount)
then
  RequestBoundary.respond (area, capacity, confirmedVenue, cutoffTime, details, endTime, gathering, locked, remaining, requestId, reservedCount, scope, startTime, status, title, waitlistCount)
```

### Tables.Viewing.ViewTable:link-unknown

Authored path: `Tables.Viewing.ViewTable`.
- Covered by [Tables](../design/compositions/Tables.md), line 18.
- Covered by [Tables](../design/compositions/Tables.md), line 21.

```reaction
when RequestBoundary.request (path: "/api/tables/view", requestId, token)
where
  now is now
  no Linking._resolve (now, token)
then
  RequestBoundary.respond (error: "LINK_NOT_FOUND", requestId)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/api/links/create` — requires `session`, `gathering`; fills `label` with null when absent
- `/api/links/list` — requires `session`, `gathering`
- `/api/links/revoke` — requires `session`, `link`
- `/api/tables/accept` — requires `session`, `token`
- `/api/tables/create` — requires `session`, `title`, `area`, `startTime`, `endTime`, `cutoffTime`, `capacity`; fills `confirmedVenue` with null when absent; fills `details` with null when absent; fills `linkLabel` with null when absent; fills `scope` with null when absent
- `/api/tables/mine` — requires `session`
- `/api/tables/place` — requires `session`, `gathering`
- `/api/tables/view` — requires `token`
- `/api/tables/withdraw` — requires `session`, `gathering`
- `/auth/logout` — requires `session`
- `/auth/me` — fills `session` with null when absent
- `/auth/petrock/callback` — requires `code`, `state`
- `/auth/petrock/start` — fills `returnTo` with null when absent
- `/auth/test-login` — fills `account` with null when absent; fills `returnTo` with null when absent
- `/gatherings/book` — requires `session`, `gathering`
- `/gatherings/cancel` — requires `session`, `gathering`
- `/gatherings/confirm` — requires `session`, `gathering`
- `/gatherings/create` — requires `session`, `title`, `area`, `startTime`, `endTime`, `cutoffTime`, `capacity`; fills `confirmedVenue` with "" when absent; fills `details` with "" when absent
- `/gatherings/mine` — requires `session`
- `/gatherings/view` — requires `session`, `gathering`
