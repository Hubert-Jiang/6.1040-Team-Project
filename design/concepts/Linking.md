# Linking

## Purpose

Issue, resolve, revoke, and reactivate unguessable shareable links for target resources so an owner can share one link across a group or issue separate channel links without tying links to individual user identities.

## Principle

A creator generates a shareable link token pointing to a target resource, optionally labeled by channel or given an expiration time. Anyone who presents an active, unexpired token resolves it to the target; revoking a link stops future access through that token without affecting the target's other links, and the creator can reactivate a revoked link later.

## Types

```types
external Target
  The resource or gathering that a shareable link points to.

external Creator
  The user permitted to create, revoke, and activate links for a target.
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
  Rule: trimmed label, when present, is at most 80 characters
```

## Actions

```actions
createLink (target: Target, creator: Creator, label?: String, expiresAt?: DateTime, now: DateTime) : returns (link: Link, token: String)
  where expiresAt is present and expiresAt <= now
  then
    refuses INVALID_EXPIRY "Link expiration must be in the future."
  where (expiresAt is absent or expiresAt > now) and label is present and trimmed label exceeds 80 characters
  then
    refuses INVALID_LABEL "Link label must be 80 characters or fewer."
  where (expiresAt is absent or expiresAt > now) and (label is absent or trimmed label is at most 80 characters)
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

activateLink (link: Link, creator: Creator) : returns ()
  where link is not in Links or link's creator is not creator
  then
    refuses NOT_CREATOR "Only the link creator can activate this link."
  where link is in Links and link's creator is creator
  then
    set link's active to true
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
