# Gatherings

## Creating a table

A signed-in host [creates a table](reaction:Gatherings.Creating.Create) with `session`, `title`, `area`, `startTime`, `endTime`, `cutoffTime`, `capacity`, and optional `details` and `confirmedVenue`. The endpoint binds [current time](computation:now) once and turns the three times, which arrive as text, into timestamps with [time parsing](computation:parseTime). `Sessioning.current` then resolves `session` to the host (refusing `UNKNOWN_SESSION`), so a request never names its own host. `Hosting.create` adds the gathering as OPEN (refusing `INVALID_DETAILS`, `INVALID_SCHEDULE`, or `HOST_LIMIT_REACHED`), `Reserving.openPool` opens its pool of `capacity` guest spots, and the endpoint returns `gathering`. Nothing is rolled back between actions, so input that is not text, or a `capacity` that is not a whole number of at least 1, is refused with `INVALID_INPUT` before anything is created.

## Viewing tables

A host [lists their own tables](reaction:Gatherings.Viewing.Mine) with `session`. The answer is [the gatherings they host](former:Gatherings.Viewing.Hosted) from `Hosting._getHosted`, each with its `gathering`, `title`, `status`, and `startTime`, latest start first.

A host [views one of their tables](reaction:Gatherings.Viewing.View) with `session` and `gathering`. When `Hosting._getDetails` names the signed-in user as its host, the endpoint returns the gathering's details together with the live counts from `Reserving._getAvailability`. A gathering that does not exist and one hosted by someone else are both refused with `NO_SUCH_TABLE`, so the answer does not reveal which tables exist. Guests do not view a table through this endpoint.

## Managing a table

Each of these takes `session` and `gathering`, resolves the host through `Sessioning.current`, and returns nothing. `Hosting` refuses anyone but the gathering's host with `NOT_HOST`, which the wire reports the same way as `NO_SUCH_TABLE`.

A host [confirms a table](reaction:Gatherings.Managing.Confirm) before its cutoff through `Hosting.confirm`, which refuses `CANNOT_CONFIRM` once the cutoff has passed or the gathering is no longer OPEN. A host [marks a table booked](reaction:Gatherings.Managing.MarkBooked) through `Hosting.markBooked` after placing the restaurant booking themselves, which refuses `CANNOT_BOOK` unless the gathering is CONFIRMED and has a venue. A host [cancels a table](reaction:Gatherings.Managing.Cancel) through `Hosting.cancel`, which refuses `CANNOT_CANCEL` once the gathering is CLOSED or CANCELLED, and `Reserving.lock` then freezes its pool so a cancelled table takes no more reservations.

```endpoints
Gatherings.Creating.Create at /gatherings/create
Gatherings.Viewing.Mine at /gatherings/mine
Gatherings.Viewing.View at /gatherings/view
Gatherings.Managing.Confirm at /gatherings/confirm
Gatherings.Managing.MarkBooked at /gatherings/book
Gatherings.Managing.Cancel at /gatherings/cancel
```

```computations
parseTime(raw: String) : DateTime
  Returns the timestamp written in raw, or an invalid timestamp that every schedule check refuses when raw is not a date.
```
