# Reserving

## Purpose

Maintain an exact, live headcount for a bounded resource by converting soft interest into explicit reservations and automatically reassigning cancelled spots from a FIFO waitlist while open.

## Principle

A resource pool opens with a positive capacity. While unlocked, users reserve open slots until capacity is reached, and subsequent users join a waitlist. If a reservation is cancelled while unlocked, the next waitlisted user is promoted into a new reservation automatically; once locked, reservations freeze.

## Types

```types
external Resource
  The gathering or bounded resource whose capacity is being reserved.

external User
  An authenticated user who can reserve a slot or join the waitlist.
```

## State

```state
a set of Pools with
  a unique Resource
  a capacity Number
  a locked Flag
  a waitlist seq of Users
  Rule: capacity >= 1
  Rule: waitlist contains no duplicate Users
  Rule: waitlist is empty unless the count of Reservations for the Resource equals capacity
  Rule: for every Pool, the count of Reservations for its Resource is <= capacity, and waitlist is disjoint from reserved Users

a set of Reservations with
  a Resource
  a User
  unique resource and user
```

## Actions

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

claim(resource: Resource, user: User) : returns (reservation?: Reservation, position?: Number)
  where pool exists for resource, pool is not locked, no Reservation exists for (resource, user), and user is not in pool's waitlist
  then
    if the count of Reservations for resource < pool's capacity then add a new reservation with resource and user
    otherwise append user to the end of pool's waitlist and record position as user's 1-based place in it
    returns reservation, position
  where pool is locked
  then
    refuses POOL_CLOSED "Reservations are locked for this resource."
  where a Reservation exists for (resource, user) or user is in pool's waitlist
  then
    refuses ALREADY_IN_POOL "You already hold a reservation or waitlist spot."

cancel(reservation: Reservation) : returns (resource: Resource, user: User, promoted?: User)
  where reservation is in Reservations and pool for reservation's resource is not locked
  then
    record resource and user of reservation
    remove reservation from Reservations
    if pool's waitlist is non-empty then pop its first user as promoted and add a new reservation with resource and promoted
    returns resource, user, promoted
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

lock(resource: Resource) : returns ()
  where pool exists for resource and pool is not locked
  then
    set pool's locked to true
    returns
```

## Queries

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
