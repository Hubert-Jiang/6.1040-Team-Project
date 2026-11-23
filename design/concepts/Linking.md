# Linking

## Purpose

Issue, resolve, and revoke unguessable shareable links for target resources so an owner can share one link across a group or issue separate channel links without tying links to individual user identities.

## Principle

A creator generates a shareable link token pointing to a target resource, optionally labeled by channel or given an expiration time. Anyone who presents an active, unexpired token resolves it to the target; revoking a link stops future access through that token without affecting the target's other links.

## Types

```types
external Target
  The resource or gathering that a shareable link points to.

external Creator
  The user permitted to create and revoke links for a target.
```

## State

```state
a set of Links with
  a unique token String
  a target Target
  a creator Creator
  an optional label String
  a active Flag
  an optional expiresAt DateTime
  a createdAt DateTime
```

## Actions

```actions
createLink (target: Target, creator: Creator, label?: String, expiresAt?: DateTime, now: DateTime) : returns (link: Link, token: String)
  where expiresAt is present and expiresAt <= now
  then
    refuses INVALID_EXPIRY "Link expiration must be in the future."
  where expiresAt is absent or expiresAt > now
  then
    generate a fresh unguessable unique token
    add a new link with token, target, creator, label, active true, expiresAt, and createdAt now
    returns link, token

revokeLink (link: Link, creator: Creator) : returns ()
  where link is not in Links or link's creator is not creator
  then
    refuses NOT_CREATOR "Only the link creator can revoke this link."
  where link is in Links and link's creator is creator
  then
    set link's active to false
    returns

revokeAllForTarget (target: Target) : returns ()
  where true
  then
    set active to false for every link in Links with matching target
    returns
```

## Queries

```queries
_resolve (token: String, now: DateTime) : optional (target: Target, link: Link)
  answers target and link when a Link has token, is active, and has no expiresAt or now < expiresAt
  answers no row otherwise

_listForTarget (target: Target) : many (link: Link, token: String, label?: String, active: Flag, expiresAt?: DateTime)
  answers every link for target, active links first and then oldest first, or no rows if there are none
```
