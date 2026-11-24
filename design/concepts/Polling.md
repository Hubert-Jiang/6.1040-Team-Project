# Polling

## Purpose

Coordinate scoped group decision-making over participant-nominated text options with single-choice switchable votes, without scoring items independently with upvotes/downvotes or recommending options from user preferences.

## Principle

Within scope `lunch_1`, Ari proposes `Dumpling House` and Bea proposes `Taco Spot`, while a duplicate proposal `dumpling house` is refused. Ari votes for `Dumpling House` and Bea votes for `Taco Spot`; Bea later switches her vote to `Dumpling House`, leaving `Dumpling House` with 2 votes and `Taco Spot` with 0. Ari clears his vote so `Dumpling House` has 1 vote, and removing `Dumpling House` deletes that option and Bea's vote for it.

## Types

```types
external Scope
  An external group or context within which options are proposed and voted on.

external Participant
  An authenticated user who may propose options and cast a single vote within a scope.
```

## State

```state
a set of Options with
  a scope Scope
  a label String
  a normalizedLabel String
  a proposedBy Participant
  a createdAt DateTime
  unique scope and normalizedLabel
  Rule: each Scope has at most 20 Options
  Rule: trimmed label is non-empty and at most 100 characters, and normalizedLabel is lowercased trimmed label

a set of Votes with
  a scope Scope
  an option Option
  a voter Participant
  unique scope and voter
  Rule: every Vote's option is in Options with the same scope
```

## Actions

```actions
addOption (scope: Scope, label: String, proposedBy: Participant, now: DateTime) : returns (option: Option)
  where trimmed label is empty or trimmed label exceeds 100 characters
  then
    refuses INVALID_OPTION "Poll option label must be between 1 and 100 non-whitespace characters."
  where trimmed label is non-empty and trimmed label is at most 100 characters and an Option exists in Options for scope whose normalizedLabel equals lowercased trimmed label
  then
    refuses DUPLICATE_OPTION "An option with that name already exists in this poll."
  where trimmed label is non-empty and trimmed label is at most 100 characters and no Option exists in Options for scope whose normalizedLabel equals lowercased trimmed label and scope currently has 20 or more Options
  then
    refuses OPTION_LIMIT_REACHED "A poll can have at most 20 options."
  where trimmed label is non-empty and trimmed label is at most 100 characters and no Option exists in Options for scope whose normalizedLabel equals lowercased trimmed label and scope currently has fewer than 20 Options
  then
    add a new option in Options with scope, trimmed label as label, lowercased trimmed label as normalizedLabel, proposedBy, and now as createdAt
    returns option

castVote (scope: Scope, option: Option, voter: Participant) : returns ()
  where option is not in Options or option's scope is not scope
  then
    refuses NO_SUCH_OPTION "Poll option not found in this scope."
  where option is in Options and option's scope is scope
  then
    create or update the Vote in Votes for (scope, voter) so its option is option
    returns

clearVote (scope: Scope, voter: Participant) : returns ()
  where true
  then
    remove any Vote in Votes for (scope, voter)
    returns

removeOption (scope: Scope, option: Option) : returns ()
  where option is not in Options or option's scope is not scope
  then
    refuses NO_SUCH_OPTION "Poll option not found in this scope."
  where option is in Options and option's scope is scope
  then
    remove all Votes in Votes with scope and option
    remove option from Options
    returns
```

## Queries

```queries
_listOptions (scope: Scope) : many (option: Option, label: String, proposedBy: Participant, createdAt: DateTime)
  answers every option in Options for scope with its option, label, proposedBy, and createdAt
  answers no rows when scope has no options
  orders rows by createdAt ascending, then Option identity

_getOption (option: Option) : optional (scope: Scope, label: String, proposedBy: Participant)
  answers scope, label, and proposedBy for option in Options
  answers no row when option is not in Options

_getVoteCount (option: Option) : one (voteCount: Number)
  answers the integer count of Votes in Votes referencing option
  answers 0 when option has no votes or is not in Options

_getVote (scope: Scope, voter: Participant) : optional (option: Option)
  answers the voted option from Votes for (scope, voter)
  answers no row when voter has no vote in scope
```
