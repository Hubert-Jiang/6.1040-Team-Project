# Authenticating

## Purpose

Authenticate users through an external institutional OpenID Connect provider (MIT Touchstone via Petrock) or an explicit demo identity without passwords, email/OTP verification, or social graphs, while tracking single-use OIDC login state across redirects.

## Principle

When a user begins MIT Touchstone login from a protected route, `beginOidc` records that relative `returnTo` path under a fresh single-use expiring `state`. On callback, `consumeOidc` atomically consumes `state` to recover `returnTo`, `verifyOidcCode` exchanges the authorization code with Petrock for verified identity claims, and `authenticate` creates or updates the matching `User` with their verified email, domain, name, and affiliation. Direct identity authentication through `authenticate` creates or updates a `User` for the demo test account without external redirects.

## Types

```types
```

## State

```state
a set of Users with
  a unique externalId String
  a unique email String
  a domain String
  an optional name String
  an optional affiliation String

a set of OidcStates with
  a unique state String
  a returnTo String
  a expiresAt DateTime
```

## Actions

```actions
authenticate (externalId: String, email: String, name?: String, affiliation?: String) : returns (user: User)
  where externalId is empty or email is not well-formed
  then
    refuses INVALID_IDENTITY "A valid external identifier and email address are required."
  where another User already exists with the same email and a different externalId
  then
    refuses EMAIL_CONFLICT "That email address is already linked to another external identity."
  where externalId is non-empty, email is well-formed, and email does not conflict with another externalId
  then
    add or update the User for externalId with email, extracted domain, and optional name and affiliation
    returns user

beginOidc (returnTo: String, now: DateTime) : returns (state: String)
  where returnTo is not a safe relative path
  then
    refuses INVALID_RETURN_TO "Return path must be a relative application path."
  where returnTo is a safe relative path
  then
    add a new OidcState with a fresh unguessable state, returnTo, and expiresAt 10 minutes after now
    returns state

consumeOidc (state: String, now: DateTime) : returns (returnTo: String)
  where state is unknown or its OidcState is expired at now
  then
    refuses INVALID_STATE "Login state is invalid or has expired; please try signing in again."
  where state matches an active OidcState at now
  then
    atomically delete the matched OidcState and record its returnTo
    returns returnTo

verifyOidcCode (code: String) : returns (externalId: String, email: String, name?: String, affiliation?: String)
  where code is empty or external OIDC exchange fails or returns invalid claims
  then
    refuses OIDC_EXCHANGE_FAILED "Could not verify identity with MIT Touchstone via Petrock."
  where code is non-empty and external OIDC exchange succeeds with valid identity claims
  then
    returns externalId, email, name, affiliation
```

## Queries

```queries
_getUser (user: User) : optional (externalId: String, email: String, domain: String, name?: String, affiliation?: String)
  answers externalId, email, domain, and optional name and affiliation for user
  answers no row when user does not exist

_hasDomain (user: User, domain: String) : one (matches: Flag)
  answers matches true when user exists and its domain equals domain case-insensitively, otherwise false
  always answers one row
```
