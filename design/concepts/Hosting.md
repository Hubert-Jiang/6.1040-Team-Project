# Hosting

## Purpose

Manage the lifecycle, basic event details, and active-table limits of informal meal gatherings so hosts cannot leave unconfirmed gatherings active or spam shared channels.

## Principle

A host creates a meal gathering within their active-table limit, setting its time window, cutoff, area, and optional event details or venue. The host must confirm the gathering before its cutoff or it automatically closes; once confirmed with a venue, it can be marked booked and closes when its time window ends.

## Types

```types
external Host
  An authenticated user who organizes a gathering.

GatheringStatus is OPEN or CONFIRMED or BOOKED or CLOSED or CANCELLED
```

## State

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
  Rule: trimmed title, area, scope, and confirmedVenue are at most 100 characters, and trimmed details is at most 300 characters
```

## Actions

```actions
create(host: Host, title: String, startTime: DateTime, endTime: DateTime, cutoffTime: DateTime, details?: String, scope?: String, area: String, confirmedVenue?: String, now: DateTime) : returns (gathering: Gathering)
  where trimmed title is empty or trimmed area is empty or trimmed title exceeds 100 characters or trimmed area exceeds 100 characters or (confirmedVenue is present and trimmed confirmedVenue exceeds 100 characters) or (scope is present and trimmed scope exceeds 100 characters) or (details is present and trimmed details exceeds 300 characters)
  then
    refuses INVALID_DETAILS "Gathering title and area must be non-empty, title, area, scope, and confirmedVenue must be at most 100 characters, and details must be at most 300 characters."
  where trimmed title is non-empty and trimmed area is non-empty and trimmed title is at most 100 characters and trimmed area is at most 100 characters and (confirmedVenue is absent or trimmed confirmedVenue is at most 100 characters) and (scope is absent or trimmed scope is at most 100 characters) and (details is absent or trimmed details is at most 300 characters) and (cutoffTime > startTime or startTime >= endTime or now >= cutoffTime)
  then
    refuses INVALID_SCHEDULE "Gathering requires valid future cutoff, start, and end times."
  where trimmed title is non-empty and trimmed area is non-empty and trimmed title is at most 100 characters and trimmed area is at most 100 characters and (confirmedVenue is absent or trimmed confirmedVenue is at most 100 characters) and (scope is absent or trimmed scope is at most 100 characters) and (details is absent or trimmed details is at most 300 characters) and now < cutoffTime and cutoffTime <= startTime and startTime < endTime and host currently has 3 or more Gatherings with status OPEN or CONFIRMED
  then
    refuses HOST_LIMIT_REACHED "You already have the maximum number of active unbooked gatherings."
  where trimmed title is non-empty and trimmed area is non-empty and trimmed title is at most 100 characters and trimmed area is at most 100 characters and (confirmedVenue is absent or trimmed confirmedVenue is at most 100 characters) and (scope is absent or trimmed scope is at most 100 characters) and (details is absent or trimmed details is at most 300 characters) and now < cutoffTime and cutoffTime <= startTime and startTime < endTime and host currently has fewer than 3 Gatherings with status OPEN or CONFIRMED
  then
    add a new gathering with status OPEN and the given fields
    returns gathering

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
  where trimmed confirmedVenue is empty or trimmed confirmedVenue exceeds 100 characters
  then
    refuses INVALID_DETAILS "Confirmed venue must be non-empty and at most 100 characters."
  where trimmed confirmedVenue is non-empty and trimmed confirmedVenue is at most 100 characters and (gathering is not in Gatherings or (gathering's status is not OPEN and gathering's status is not CONFIRMED))
  then
    refuses CANNOT_SET_VENUE "Venue can only be set on an open or confirmed gathering."
  where gathering is in Gatherings and (gathering's status is OPEN or gathering's status is CONFIRMED) and trimmed confirmedVenue is non-empty and trimmed confirmedVenue is at most 100 characters
  then
    set gathering's confirmedVenue to trimmed confirmedVenue
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
  where gathering's status is CLOSED or CANCELLED
  then
    refuses CANNOT_CANCEL "This gathering has already ended or been cancelled."

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

## Queries

```queries
_getDetails(gathering: Gathering) : optional (host: Host, title: String, status: GatheringStatus, startTime: DateTime, endTime: DateTime, cutoffTime: DateTime, details?: String, scope?: String, area: String, confirmedVenue?: String)
  Returns details of gathering, or no row if gathering does not exist.

_getHosted(host: Host) : many (gathering: Gathering, title: String, status: GatheringStatus, startTime: DateTime)
  Returns every gathering of host in any status, latest startTime first, or no rows if host has none.

_getPastCutoff(now: DateTime) : many (gathering: Gathering, status: GatheringStatus)
  Returns every OPEN gathering with cutoffTime < now and every CONFIRMED or BOOKED gathering with cutoffTime <= now, earliest cutoffTime first, or no rows if there are none.

_getEnded(now: DateTime) : many (gathering: Gathering)
  Returns every CONFIRMED or BOOKED gathering with endTime <= now, earliest endTime first, or no rows if there are none.
```
