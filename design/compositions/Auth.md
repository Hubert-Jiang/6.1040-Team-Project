# Auth

## Petrock OIDC login

An unauthenticated browser navigating to a protected route such as `/tables/xyz` is redirected on the client to `/login?redirect=/tables/xyz`. Clicking MIT Touchstone login [starts a Petrock OIDC flow](reaction:Auth.Petrock.Start): an optional `returnTo` input is sanitized by [return path normalization](computation:normalizeReturnTo) so only same-origin relative paths are preserved (defaulting to `/`), [current time](computation:now) is bound once, `Authenticating.beginOidc` records a single-use expiring `state` bound to `returnTo`, and [authorization URL construction](computation:buildPetrockAuthUrl) formats `authorizationUrl` returned to the caller.

When Petrock redirects back to the application callback with `code` and `state`, the browser submits `code` and `state` to [complete Petrock OIDC authentication](reaction:Auth.Petrock.Callback). Binding [current time](computation:now) and [session lifetime](computation:sessionLifetimeMs), the endpoint first runs `Authenticating.consumeOidc` to atomically delete and validate `state` and recover `returnTo` (preventing concurrent replay with `INVALID_STATE` and keeping refusals side-effect-free), then calls `Authenticating.verifyOidcCode` to exchange `code` with Petrock (refusing `OIDC_EXCHANGE_FAILED` without mutating state), then runs `Authenticating.authenticate` to create or update the `User` (refusing `INVALID_IDENTITY` or `EMAIL_CONFLICT`), queries `Authenticating._getUser` to obtain `email`, `domain`, and optional `name` and `affiliation`, and finally starts the session via `Sessioning.start` before returning `session`, `user`, `returnTo`, `email`, `domain`, and optional `name` and `affiliation`. Because `Sessioning.start` runs last before `respond`, a failure in any earlier step creates no orphaned session.

## Test account login

For local and non-production demo testing without Touchstone credentials, `/auth/test-login` accepts optional `returnTo` and an optional `account` (`guest` signs in as a second demo user, so one person can act as a host and a guest in two browser windows; anything else signs in as the original test student) and is handled by two mutually exclusive reactions based on [test-login enablement](computation:testLoginEnabled): when `false` (the default unless `ENABLE_TEST_LOGIN=true` outside production), [rejecting disabled test-account login](reaction:Auth.Demo.TestLoginDisabled) responds with `TEST_LOGIN_DISABLED` without authenticating or starting a session; when `true`, clicking the test-account button [signs in as the demo test user](reaction:Auth.Demo.TestLogin), using [return path normalization](computation:normalizeReturnTo), [current time](computation:now), [session lifetime](computation:sessionLifetimeMs), and the demo identity derivations ([test external id](computation:testAccountExternalId), [test email](computation:testAccountEmail), [test name](computation:testAccountName), [test affiliation](computation:testAccountAffiliation)) to authenticate the test user via `Authenticating.authenticate`, query `Authenticating._getUser` for `email`, `domain`, and optional `name` and `affiliation`, and finally call `Sessioning.start` before returning `session`, `user`, `returnTo`, `email`, `domain`, and optional `name` and `affiliation`.

## Session inspection and logout

A client checks its session by calling [session inspection](reaction:Auth.Session.Me) with optional `session`, using [session presence check](computation:hasSession), [current time](computation:now), and [test-login enablement](computation:testLoginEnabled). When `hasSession` is false, or when `Sessioning._active` or `Authenticating._getUser` produces no row, the endpoint returns `authenticated: false` and `testLoginEnabled` without mutating state. When `hasSession` is true and both `Sessioning._active` and `Authenticating._getUser` succeed, the endpoint returns `authenticated: true`, `user`, `email`, `domain`, optional `name` and `affiliation`, and `testLoginEnabled`. Signing out [ends the active session](reaction:Auth.Session.Logout) by accepting `session`, binding [current time](computation:now), calling `Sessioning.end`, and returning `ended` (or refusing `UNKNOWN_SESSION` if the session is no longer active).

```endpoints
Auth.Petrock.Start at /auth/petrock/start
Auth.Petrock.Callback at /auth/petrock/callback
Auth.Demo.TestLogin at /auth/test-login
Auth.Demo.TestLoginDisabled at /auth/test-login
Auth.Session.Me at /auth/me
Auth.Session.Logout at /auth/logout
```

```computations
now() : DateTime
  Returns the current timestamp for the request flow.

sessionLifetimeMs() : Number
  Returns the fixed positive session lifetime in milliseconds.

hasSession(session?: String) : Flag
  Returns true when an optional session token is supplied and non-empty, otherwise false.

normalizeReturnTo(raw?: String) : String
  Sanitizes an optional redirect path to a safe relative application path starting with "/", defaulting to "/".

buildPetrockAuthUrl(state: String) : String
  Builds the Petrock MIT Touchstone OIDC authorization URL containing client_id, redirect_uri, scope, response_type=code, and state.

testLoginEnabled() : Flag
  Returns true only when test-account login is explicitly enabled for local/non-production use (`ENABLE_TEST_LOGIN=true` and `NODE_ENV !== "production"`), otherwise false.

testAccountExternalId(account?: String) : String
  Returns the fixed externalId for the demo test account named by account (guest, or the test student otherwise).

testAccountEmail(account?: String) : String
  Returns the fixed email address for the demo test account named by account (guest, or the test student otherwise).

testAccountName(account?: String) : String
  Returns the fixed display name for the demo test account named by account (guest, or the test student otherwise).

testAccountAffiliation(account?: String) : String
  Returns the fixed institutional affiliation for the demo test account named by account (guest, or the test student otherwise).
```
