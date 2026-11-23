# Inviting

## Purpose

Record guest acceptances to an event, including pending acceptances that wait across a signed-out guest's sign-in, so guests can accept from a shared link before or after authenticating without forcing uninterested peers to sign in just to say no.

## Principle

Bea is signed in, opens Noah's dinner, and accepts it, so `_isAccepted` answers true for her. Her plans change, so she withdraws, and `_isAccepted` answers false; she can accept again later. Cal is signed out when he clicks accept, so his acceptance is deferred under the opaque key `k1`. After he signs in, `_getPendingForKey` for `k1` answers the dinner, his pending acceptance is cleared, and he accepts it as himself.

## Types

```types
external Event
  The gathering or event to which a guest responds.

external Guest
  An authenticated user accepting an event.
```

## State

```state
a set of Acceptances with
  an event Event
  a guest Guest
  unique event and guest

a set of PendingAcceptances with
  an event Event
  a pendingKey String
  unique event and pendingKey
```

## Actions

```actions
accept (event: Event, guest: Guest) : returns (acceptance: Acceptance)
  where an Acceptance already exists for (event, guest)
  then
    refuses ALREADY_ACCEPTED "You have already accepted this invitation."
  where no Acceptance exists for (event, guest)
  then
    add a new acceptance with event and guest
    returns acceptance

withdraw (event: Event, guest: Guest) : returns ()
  where no Acceptance exists for (event, guest)
  then
    refuses NOT_ACCEPTED "You have not accepted this invitation."
  where an Acceptance exists for (event, guest)
  then
    remove the Acceptance for (event, guest)
    returns

deferAccept (event: Event, pendingKey: String) : returns ()
  where pendingKey is empty
  then
    refuses INVALID_PENDING_KEY "A non-empty pending key is required."
  where pendingKey is non-empty
  then
    add a PendingAcceptance for (event, pendingKey) unless one already exists
    returns

clearPending (event: Event, pendingKey: String) : returns ()
  where true
  then
    remove any PendingAcceptance for (event, pendingKey)
    returns
```

## Queries

```queries
_isAccepted (event: Event, guest: Guest) : one (accepted: Flag)
  answers accepted true when an Acceptance exists for (event, guest), otherwise false
  always answers one row

_getAcceptedGuests (event: Event) : many (guest: Guest)
  answers every guest with an Acceptance for event, earliest acceptance first, or no rows if there are none

_getPendingForKey (pendingKey: String) : many (event: Event)
  answers every event with a PendingAcceptance for pendingKey, earliest first, or no rows if there are none
```
