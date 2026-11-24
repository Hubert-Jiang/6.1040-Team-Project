# Profiling

## Purpose

Store each user's self-reported preferred name and optional flexible dining preferences independently of external authentication identity, without performing matching, filtering, or restaurant recommendation.

## Principle

Bea signs in and saves a preferred name `Bea K.`, dietary restrictions `VEGETARIAN`, budget tiers `BUDGET` and `MODERATE`, a 15-minute travel limit, and cuisines `Thai` and `Ramen`. Reading `_getProfile` returns those values, while updating `setProfile` replaces them and `clearProfile` removes her stored profile completely so `_getProfile` returns no row again.

## Types

```types
external User
  An authenticated user whose dining profile is stored.

DietaryTag is VEGETARIAN or VEGAN or HALAL or KOSHER or GLUTEN_FREE or DAIRY_FREE or NUT_FREE or SHELLFISH_FREE
BudgetTier is FREE or BUDGET or MODERATE or UPSCALE

opaque DietaryTagSet
  A set of DietaryTag values.

opaque BudgetTierSet
  A set of BudgetTier values.

opaque CuisineSet
  A set of non-empty cuisine Strings.
```

## State

```state
a set of Profiles with
  a unique User
  an optional preferredName String
  a dietaryRestrictions set of DietaryTag
  a budgetPreferences set of BudgetTier
  an optional walkPreferenceMinutes Number
  a cuisinePreferences set of String
  an optional notes String
  Rule: walkPreferenceMinutes, when present, is greater than 0 and at most 1440
```

## Actions

```actions
setProfile (user: User, preferredName?: String, dietaryRestrictions: DietaryTagSet, budgetPreferences: BudgetTierSet, walkPreferenceMinutes?: Number, cuisinePreferences: CuisineSet, notes?: String) : returns ()
  where walkPreferenceMinutes is present and (is not a finite number greater than 0 or exceeds 1440)
  then
    refuses INVALID_DISTANCE "Preferred travel time must be a positive number up to 1440 minutes."
  where (walkPreferenceMinutes is absent or (is a finite number greater than 0 and at most 1440)) and (an entry in dietaryRestrictions is not a DietaryTag or an entry in budgetPreferences is not a BudgetTier or trimmed preferredName exceeds 80 characters or trimmed notes exceeds 500 characters or deduplicated non-blank cuisinePreferences has more than 20 entries or any trimmed cuisine entry exceeds 50 characters)
  then
    refuses INVALID_PROFILE "Profile contains an invalid dietary tag, budget tier, or text exceeding length limits."
  where (walkPreferenceMinutes is absent or (is a finite number greater than 0 and at most 1440)) and all tags, tiers, and trimmed text lengths are within limits
  then
    trim preferredName and notes, omitting them when empty after trimming
    trim and deduplicate cuisinePreferences, omitting blank entries
    deduplicate dietaryRestrictions and budgetPreferences
    add or update the Profile in Profiles for user with the normalized fields
    returns

clearProfile (user: User) : returns ()
  where true
  then
    remove any Profile in Profiles for user
    returns
```

## Queries

```queries
_getProfile (user: User) : optional (preferredName?: String, dietaryRestrictions: DietaryTagSet, budgetPreferences: BudgetTierSet, walkPreferenceMinutes?: Number, cuisinePreferences: CuisineSet, notes?: String)
  answers preferredName, dietaryRestrictions, budgetPreferences, walkPreferenceMinutes, cuisinePreferences, and notes for user's Profile
  answers no row when user has no Profile in Profiles
```
