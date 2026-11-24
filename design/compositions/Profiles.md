# Profiles

## Managing your own profile

A signed-in user [reads their own profile](reaction:Profiles.Self.GetProfile) by sending their `session`. Binding [current time](computation:now) (from the shared `now() : DateTime` computation declared in `design/compositions/Auth.md`), `Sessioning.current` resolves the caller to `user`, refusing `UNKNOWN_SESSION` when the session is inactive, so requests never self-assert identity. The endpoint reads `Authenticating._getUser` for verified `email` and optional Touchstone `name` (`accountName`), refusing `UNKNOWN_SESSION` if `Authenticating._getUser` returns no row for `user`. It then reads optional `Profiling._getProfile` for `user`. When a `Profiling` row exists, it returns `email`, optional `accountName`, `displayName` computed via [display name resolution](computation:resolveDisplayName) (`preferredName -> accountName -> email`), and the stored `Profiling` fields. When `Profiling._getProfile` returns no row, the no-profile branch supplies literal `[]` for `dietaryRestrictions`, `budgetPreferences`, and `cuisinePreferences` and leaves `preferredName`, `walkPreferenceMinutes`, and `notes` absent/`null`, while [display name resolution](computation:resolveDisplayName) resolves `displayName` from `accountName` and `email` without exposing raw `email` as a display name when any name exists.

A signed-in user [saves their profile](reaction:Profiles.Self.SaveProfile) by sending their `session` and optional `preferredName`, `dietaryRestrictions`, `budgetPreferences`, `walkPreferenceMinutes`, `cuisinePreferences`, and `notes`. After `Sessioning.current` resolves `user` at [current time](computation:now) (refusing `UNKNOWN_SESSION`), omitted optional inputs use endpoint input defaults at the boundary (`[]` for omitted `dietaryRestrictions`, `budgetPreferences`, and `cuisinePreferences`; absent/`null` for omitted `preferredName`, `walkPreferenceMinutes`, and `notes`) before calling `Profiling.setProfile`. `Profiling.setProfile` is the sole mutator and enforces `INVALID_DISTANCE` and `INVALID_PROFILE` before making any change, so any refusal leaves the user's stored profile unchanged. The endpoint returns `saved: true` only after `Profiling.setProfile` succeeds.

A signed-in user [clears their profile](reaction:Profiles.Self.ClearProfile) by sending their `session`. After `Sessioning.current` resolves `user` at [current time](computation:now) (refusing `UNKNOWN_SESSION`), `Profiling.clearProfile` idempotently removes any stored profile for `user`, and the endpoint returns `cleared: true` after that removal finishes.

```endpoints
Profiles.Self.GetProfile at /api/profiles/me
Profiles.Self.SaveProfile at /api/profiles/save
Profiles.Self.ClearProfile at /api/profiles/clear
```

## Viewing an active table's roster and profiles

A signed-in participant [views tablemate profiles](reaction:Profiles.Table.ViewTableProfiles) by sending their `session` and `gathering`. Binding [current time](computation:now), `Sessioning.current` resolves the caller to `viewer` (refusing `UNKNOWN_SESSION`). The endpoint reads `Hosting._getDetails` for `gathering`; when no gathering exists, it refuses `NO_SUCH_TABLE`. It then checks `status` with [active table check](computation:isActiveTableStatus): once the gathering is `CLOSED` or `CANCELLED`, it refuses `TABLE_INACTIVE`. While the gathering is `OPEN`, `CONFIRMED`, or `BOOKED`, `viewer` must either equal the gathering's `host` or hold an active reservation (`Reserving._hasReservation` returns `reserved: true`); arbitrary signed-in users and waitlisted-only users are refused `NOT_PARTICIPANT`.

For an authorized viewer on an active table, the endpoint builds the `host` record using [participant profile](former:Profiles.Table.ParticipantProfile) and the `seated` list using [seated tablemates](former:Profiles.Table.SeatedProfiles) over the users returned by `Reserving._getReservedUsers`. For the host and each seated guest, `ParticipantProfile` and `SeatedProfiles` read `Authenticating._getUser` (omitting any participant without a `Users` row, though every host and reservation holder is authenticated) and optional `Profiling._getProfile`. Using `whether`, when a `Profiling` row exists they include `preferredName`, `dietaryRestrictions`, `budgetPreferences`, `walkPreferenceMinutes`, `cuisinePreferences`, and `notes`, and when `Profiling._getProfile` returns no row they leave those optional `Profiling` fields absent/`null`; in both cases [display name resolution](computation:resolveDisplayName) resolves `displayName` (`preferredName -> accountName -> email`) from `preferredName` (if present), `accountName`, and `email`, never exposing raw `email` separately on tablemate records. Because this endpoint is read-only and checks `Hosting` status and `Reserving` membership on every request, no table state is mutated and withdrawn or waitlisted users immediately lose access.

```endpoints
Profiles.Table.ViewTableProfiles at /api/tables/profiles
```

Shared computation [current time](computation:now) uses `now() : DateTime` declared in `design/compositions/Auth.md`.

```computations
resolveDisplayName(preferredName?: String, accountName?: String, email: String) : String
  Returns trimmed preferredName when non-empty, otherwise trimmed accountName when non-empty, otherwise email.

isActiveTableStatus(status: String) : Flag
  Returns true when status is OPEN, CONFIRMED, or BOOKED, otherwise false.
```
