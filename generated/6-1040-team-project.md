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

- `buildPetrockAuthUrl(state: String) : String` — [Auth](../design/compositions/Auth.md), line 38.
- `hasSession(session?: String) : Flag` — [Auth](../design/compositions/Auth.md), line 32.
- `normalizeReturnTo(raw?: String) : String` — [Auth](../design/compositions/Auth.md), line 35.
- `now() : DateTime` — [Auth](../design/compositions/Auth.md), line 26.
- `parseTime(raw: String) : DateTime` — [Gatherings](../design/compositions/Gatherings.md), line 29.
- `sessionLifetimeMs() : Number` — [Auth](../design/compositions/Auth.md), line 29.
- `testAccountAffiliation() : String` — [Auth](../design/compositions/Auth.md), line 50.
- `testAccountEmail() : String` — [Auth](../design/compositions/Auth.md), line 44.
- `testAccountExternalId() : String` — [Auth](../design/compositions/Auth.md), line 41.
- `testAccountName() : String` — [Auth](../design/compositions/Auth.md), line 47.

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

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

## Reactions

### Auth.Demo.TestLogin

Authored path: `Auth.Demo.TestLogin`.
- Covered by [Auth](../design/compositions/Auth.md), line 11.
- Covered by [Auth](../design/compositions/Auth.md), line 20.

```reaction
when RequestBoundary.request (path: "/auth/test-login", requestId, returnTo)
where
  now is now
  lifetime is sessionLifetimeMs
  safeReturnTo is normalizeReturnTo (raw: returnTo)
  externalId is testAccountExternalId
  email is testAccountEmail
  name is testAccountName
  affiliation is testAccountAffiliation
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
  earlier, RequestBoundary.request (path: "/auth/test-login", requestId, returnTo)
  safeReturnTo is normalizeReturnTo (raw: returnTo)
then
  RequestBoundary.respond (affiliation: resolvedAffiliation, domain, email: resolvedEmail, name: resolvedName, requestId, returnTo: safeReturnTo, session, user)
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
- Covered by [Auth](../design/compositions/Auth.md), line 22.

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
- Covered by [Auth](../design/compositions/Auth.md), line 22.

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
- Covered by [Auth](../design/compositions/Auth.md), line 21.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [true]
  now is now
  Sessioning._active (now, session) has (subject: user)
  Authenticating._getUser (user) has (affiliation, domain, email, name)
then
  RequestBoundary.respond (affiliation, authenticated: true, domain, email, name, requestId, user)
```

### Auth.Session.Me:session-inactive

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 21.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [true]
  now is now
  no Sessioning._active (now, session)
then
  RequestBoundary.respond (authenticated: false, requestId)
```

### Auth.Session.Me:session-missing

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 21.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [false]
then
  RequestBoundary.respond (authenticated: false, requestId)
```

### Auth.Session.Me:user-missing

Authored path: `Auth.Session.Me`.
- Covered by [Auth](../design/compositions/Auth.md), line 15.
- Covered by [Auth](../design/compositions/Auth.md), line 21.

```reaction
when RequestBoundary.request (path: "/auth/me", requestId, session)
where
  sessionPresent is hasSession (session)
  sessionPresent is among [true]
  now is now
  Sessioning._active (now, session) has (subject: user)
  no Authenticating._getUser (user)
then
  RequestBoundary.respond (authenticated: false, requestId)
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

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/auth/logout` — requires `session`
- `/auth/me` — fills `session` with null when absent
- `/auth/petrock/callback` — requires `code`, `state`
- `/auth/petrock/start` — fills `returnTo` with null when absent
- `/auth/test-login` — fills `returnTo` with null when absent
- `/gatherings/book` — requires `session`, `gathering`
- `/gatherings/cancel` — requires `session`, `gathering`
- `/gatherings/confirm` — requires `session`, `gathering`
- `/gatherings/create` — requires `session`, `title`, `area`, `startTime`, `endTime`, `cutoffTime`, `capacity`; fills `confirmedVenue` with "" when absent; fills `details` with "" when absent
- `/gatherings/mine` — requires `session`
- `/gatherings/view` — requires `session`, `gathering`
