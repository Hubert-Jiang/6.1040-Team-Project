import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, is, no, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const Start = endpoint(
  "/auth/petrock/start",
  ({ returnTo, now, safeReturnTo, state, authorizationUrl }) =>
    receive({ returnTo })
      .then(
        where(
          compute(computations.now, {}, now),
          compute(computations.normalizeReturnTo, { raw: returnTo }, safeReturnTo),
        ).then(concepts.Authenticating.beginOidc({ returnTo: safeReturnTo, now }).responds({ state })),
      )
      .then(
        where(compute(computations.buildPetrockAuthUrl, { state }, authorizationUrl)).then(
          respond({ authorizationUrl }),
        ),
      ),
  { input: { defaults: { returnTo: null } } },
);

const Callback = endpoint(
  "/auth/petrock/callback",
  ({
    code,
    state,
    now,
    lifetime,
    returnTo,
    externalId,
    email,
    name,
    affiliation,
    user,
    resolvedEmail,
    domain,
    resolvedName,
    resolvedAffiliation,
    session,
  }) =>
    receive({ code, state })
      .then(
        where(
          compute(computations.now, {}, now),
          compute(computations.sessionLifetimeMs, {}, lifetime),
        ).then(concepts.Authenticating.consumeOidc({ state, now }).responds({ returnTo })),
      )
      .then(concepts.Authenticating.verifyOidcCode({ code }).responds({ externalId, email, name, affiliation }))
      .then(concepts.Authenticating.authenticate({ externalId, email, name, affiliation }).responds({ user }))
      .then(
        where(
          concepts.Authenticating._getUser({ user }).is({
            email: resolvedEmail,
            domain,
            name: resolvedName,
            affiliation: resolvedAffiliation,
          }),
        ).then(concepts.Sessioning.start({ subject: user, lifetime, now }).responds({ session })),
      )
      .then(
        where(
          concepts.Authenticating._getUser({ user }).is({
            email: resolvedEmail,
            domain,
            name: resolvedName,
            affiliation: resolvedAffiliation,
          }),
        ).then(
          respond({
            session,
            user,
            returnTo,
            email: resolvedEmail,
            domain,
            name: resolvedName,
            affiliation: resolvedAffiliation,
          }),
        ),
      ),
  { input: { required: ["code", "state"] } },
);

const TestLogin = endpoint(
  "/auth/test-login",
  ({
    returnTo,
    now,
    lifetime,
    safeReturnTo,
    externalId,
    email,
    name,
    affiliation,
    user,
    resolvedEmail,
    domain,
    resolvedName,
    resolvedAffiliation,
    session,
  }) =>
    receive({ returnTo })
      .then(
        where(
          compute(computations.now, {}, now),
          compute(computations.sessionLifetimeMs, {}, lifetime),
          compute(computations.normalizeReturnTo, { raw: returnTo }, safeReturnTo),
          compute(computations.testAccountExternalId, {}, externalId),
          compute(computations.testAccountEmail, {}, email),
          compute(computations.testAccountName, {}, name),
          compute(computations.testAccountAffiliation, {}, affiliation),
        ).then(concepts.Authenticating.authenticate({ externalId, email, name, affiliation }).responds({ user })),
      )
      .then(
        where(
          concepts.Authenticating._getUser({ user }).is({
            email: resolvedEmail,
            domain,
            name: resolvedName,
            affiliation: resolvedAffiliation,
          }),
        ).then(concepts.Sessioning.start({ subject: user, lifetime, now }).responds({ session })),
      )
      .then(
        where(
          concepts.Authenticating._getUser({ user }).is({
            email: resolvedEmail,
            domain,
            name: resolvedName,
            affiliation: resolvedAffiliation,
          }),
        ).then(
          respond({
            session,
            user,
            returnTo: safeReturnTo,
            email: resolvedEmail,
            domain,
            name: resolvedName,
            affiliation: resolvedAffiliation,
          }),
        ),
      ),
  { input: { defaults: { returnTo: null } } },
);

const Me = endpoint(
  "/auth/me",
  ({ session, sessionPresent, now, user, email, domain, name, affiliation }) =>
    receive({ session }).then(
      where(compute(computations.hasSession, { session }, sessionPresent), is.among(sessionPresent, [false]))
        .then(respond({ authenticated: false }))
        .named("session-missing"),
      where(
        compute(computations.hasSession, { session }, sessionPresent),
        is.among(sessionPresent, [true]),
        compute(computations.now, {}, now),
        no(concepts.Sessioning._active({ session, now })),
      )
        .then(respond({ authenticated: false }))
        .named("session-inactive"),
      where(
        compute(computations.hasSession, { session }, sessionPresent),
        is.among(sessionPresent, [true]),
        compute(computations.now, {}, now),
        concepts.Sessioning._active({ session, now }).is({ subject: user }),
        no(concepts.Authenticating._getUser({ user })),
      )
        .then(respond({ authenticated: false }))
        .named("user-missing"),
      where(
        compute(computations.hasSession, { session }, sessionPresent),
        is.among(sessionPresent, [true]),
        compute(computations.now, {}, now),
        concepts.Sessioning._active({ session, now }).is({ subject: user }),
        concepts.Authenticating._getUser({ user }).is({ email, domain, name, affiliation }),
      )
        .then(respond({ authenticated: true, user, email, domain, name, affiliation }))
        .named("authenticated"),
    ),
  { input: { defaults: { session: null } } },
);

const Logout = endpoint(
  "/auth/logout",
  ({ session, now, ended }) =>
    receive({ session })
      .then(where(compute(computations.now, {}, now)).then(concepts.Sessioning.end({ session, now }).responds({ ended })))
      .then(respond({ ended })),
  { input: { required: ["session"] } },
);

export const authComposition = {
  Petrock: { Start, Callback },
  Demo: { TestLogin },
  Session: { Me, Logout },
};
