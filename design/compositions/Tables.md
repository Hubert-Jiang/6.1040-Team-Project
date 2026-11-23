# Tables

## Creating a table

A signed-in host [creates a table](reaction:Tables.Hosting.CreateTable) by sending their `session` with a title, an area, a start, end, and RSVP cutoff time, a seat `capacity` (open seats besides the host's own), and optionally details, a domain `scope` such as `mit.edu`, a `confirmedVenue`, and a label for the first link. Binding [current time](computation:now), the endpoint resolves the host through `Sessioning.current`, refusing `UNKNOWN_SESSION` when the session is not active. It then checks the capacity with [capacity validation](computation:isValidCapacity) before anything is created, answering `INVALID_CAPACITY` for anything other than a whole number from 1 to 50, so a refused capacity never leaves a table without a seat pool. When a scope is given ([text presence check](computation:hasText)), the host must belong to it: `Authenticating._hasDomain` must match, or the endpoint answers `SCOPE_MISMATCH` and creates nothing. The three times are read from ISO strings by [time parsing](computation:parseTime); an unreadable time becomes an invalid date that `Hosting.create` refuses as `INVALID_SCHEDULE`.

`Hosting.create` makes the gathering (refusing `INVALID_DETAILS`, `INVALID_SCHEDULE`, or `HOST_LIMIT_REACHED`), `Reserving.openPool` opens its pool with the capacity, and `Linking.createLink` issues the first shareable link, labeled with the optional link label. The endpoint returns the `gathering`, the `link`, and its `token`.

A signed-in host can [list their tables](reaction:Tables.Hosting.MyTables). The answer uses the [host's tables](former:Tables.Hosting.HostedTables), every gathering from `Hosting._getHosted` with its identity, title, status, and start time, latest start first.

```endpoints
Tables.Hosting.CreateTable at /api/tables/create
Tables.Hosting.MyTables at /api/tables/mine
```

## Viewing a table by link

Anyone holding a link token can [view the table](reaction:Tables.Viewing.ViewTable) without signing in. Binding [current time](computation:now), `Linking._resolve` turns an active, unexpired token into its gathering; the endpoint then answers the gathering's details from `Hosting._getDetails` (title, status, times, details, scope, area, and confirmed venue) and the live seat counts from `Reserving._getAvailability` (capacity, reserved count, remaining seats, waitlist count, and whether seats are locked). A revoked, expired, or made-up token answers `LINK_NOT_FOUND` and reveals nothing about any table.

```endpoints
Tables.Viewing.ViewTable at /api/tables/view
```

## Joining a table

A signed-in guest holding a link can [accept the table](reaction:Tables.Joining.AcceptTable) by sending their `session` and the link `token`. Using the [current time](computation:now), `Sessioning.current` resolves the guest, and `Linking._resolve` turns the token into its gathering. A revoked, expired, or made-up token answers `LINK_NOT_FOUND`. The table's own host answers `OWN_TABLE`, since the host's seat is not part of the pool. The endpoint then reads the gathering's status, cutoff, and scope from `Hosting._getDetails` and whether seats are locked from `Reserving._getAvailability`, and [checks the table still takes guests](computation:isAcceptingGuests): it must be OPEN or CONFIRMED, unlocked, and not past its cutoff, or the endpoint answers `TABLE_CLOSED`. When the table has a scope ([text presence check](computation:hasText)), `Authenticating._hasDomain` must match the guest, or the endpoint answers `SCOPE_MISMATCH`. Otherwise `Inviting.accept` records the acceptance, refusing `ALREADY_ACCEPTED` for a second accept, and `Reserving.claim` gives the guest a seat if one is open and a waitlist place if not, in one atomic step. The answer carries the `gathering` and the guest's `place`, from [a guest's place at a table](former:Tables.Joining.GuestPlace): the `reservation` from `Reserving._getReservation` when seated and the 1-based waitlist `position` from `Reserving._getWaitlistPosition` when waiting, the other one blank.

A guest who accepted can [withdraw](reaction:Tables.Joining.WithdrawTable) by sending their `session` and the `gathering`, after `Sessioning.current` resolves them with the [current time](computation:now). A seated guest's reservation is released first with `Reserving.cancel`, which refuses `CANNOT_CANCEL` once seats are locked and otherwise hands the seat to the first guest on the waitlist in the same step; `Inviting.withdraw` then removes the acceptance. A waitlisted guest leaves the waitlist with `Reserving.leaveWaitlist` before `Inviting.withdraw`, unless seats are locked, which answers `TABLE_CLOSED`. A guest holding neither is passed straight to `Inviting.withdraw`, which refuses `NOT_ACCEPTED` when there is nothing to withdraw. A withdrawn guest can accept again later.

Accepting before signing in needs no extra endpoint. The table page sends a signed-out guest to login with a `returnTo` such as `/t/<token>?accept=1`, which `/auth/test-login` and the Petrock flow already carry across the redirect, and the page calls the accept endpoint when the guest lands back on it.

A signed-in viewer can [check their own place](reaction:Tables.Joining.MyPlace) at a table by sending their `session` and the `gathering`, after `Sessioning.current` resolves them with the [current time](computation:now). The answer says whether `Hosting._getDetails` names them as the host (`hosting`), and gives their `place` from [a guest's place at a table](former:Tables.Joining.GuestPlace), so the table page knows whether to show the host's link panel, an Accept button, or a Withdraw button.

```endpoints
Tables.Joining.AcceptTable at /api/tables/accept
Tables.Joining.WithdrawTable at /api/tables/withdraw
Tables.Joining.MyPlace at /api/tables/place
```

## Sharing links

Only the table's host can manage its links. Each of these endpoints resolves the host through `Sessioning.current` with [current time](computation:now) first. A host can [create another link](reaction:Tables.Sharing.CreateLink) for one of their gatherings with an optional label, for example one per group chat; `Hosting._getDetails` must name the session's user as host, or the endpoint answers `NOT_HOST`. A host can [list a table's links](reaction:Tables.Sharing.ListLinks) under the same check, answered by [a table's links](former:Tables.Sharing.TableLinks): every link from `Linking._listForTarget` with its identity, token, label, whether it is active, and its expiry, active links first. A host can [revoke a link](reaction:Tables.Sharing.RevokeLink); `Linking.revokeLink` refuses `NOT_CREATOR` for anyone but the link's creator, and a revoked link stops resolving while the table's other links keep working.

```endpoints
Tables.Sharing.CreateLink at /api/links/create
Tables.Sharing.ListLinks at /api/links/list
Tables.Sharing.RevokeLink at /api/links/revoke
```

```computations
hasText(value?: String) : Flag
  Returns true when an optional string is supplied and not blank, otherwise false.

isValidCapacity(capacity?: Number) : Flag
  Returns true when capacity is a whole number from 1 to 50, otherwise false.

isAcceptingGuests(status: String, locked: Flag, cutoffTime: DateTime, now: DateTime) : Flag
  Returns true when status is OPEN or CONFIRMED, locked is false, and now is not after cutoffTime, otherwise false.
```
