import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, form, former, is, no, where, whether } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const { Authenticating, Hosting, Profiling, Reserving, Sessioning } = concepts;

/** A participant's public tablemate profile without raw email. */
const ParticipantProfile = former(
  "a participant's profile",
  (
    { user },
    {
      email,
      accountName,
      displayName,
      preferredName,
      dietaryRestrictions,
      budgetPreferences,
      walkPreferenceMinutes,
      cuisinePreferences,
      notes,
    },
  ) =>
    where(
      Authenticating._getUser({ user }).is({ email }),
      whether(Authenticating._getUser({ user }).is({ name: accountName })),
      whether(
        Profiling._getProfile({ user }).is({
          preferredName,
          dietaryRestrictions,
          budgetPreferences,
          walkPreferenceMinutes,
          cuisinePreferences,
          notes,
        }),
      ),
      compute(computations.resolveDisplayName, { preferredName, accountName, email }, displayName),
    ).form({
      user,
      displayName,
      preferredName,
      dietaryRestrictions,
      budgetPreferences,
      walkPreferenceMinutes,
      cuisinePreferences,
      notes,
    }),
);

/** Seated tablemates' profiles for a gathering, omitting any participant without a Users row. */
const SeatedProfiles = former("the seated tablemates", ({ gathering }, { user }) =>
  each(Reserving._getReservedUsers({ resource: gathering }).is({ user }))
    .form({})
    .splicing(ParticipantProfile({ user })),
);

const GetProfile = endpoint(
  "/api/profiles/me",
  ({
    session,
    now,
    user,
    email,
    accountName,
    displayName,
    preferredName,
    dietaryRestrictions,
    budgetPreferences,
    walkPreferenceMinutes,
    cuisinePreferences,
    notes,
  }) =>
    receive({ session })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(
        where(no(Authenticating._getUser({ user })))
          .then(respond({ error: "UNKNOWN_SESSION" }))
          .named("unknown-user"),
        where(
          Authenticating._getUser({ user }).is({ email }),
          whether(Authenticating._getUser({ user }).is({ name: accountName })),
          Profiling._getProfile({ user }).is({
            preferredName,
            dietaryRestrictions,
            budgetPreferences,
            walkPreferenceMinutes,
            cuisinePreferences,
            notes,
          }),
          compute(computations.resolveDisplayName, { preferredName, accountName, email }, displayName),
        )
          .then(
            respond({
              email,
              accountName,
              displayName,
              preferredName,
              dietaryRestrictions,
              budgetPreferences,
              walkPreferenceMinutes,
              cuisinePreferences,
              notes,
            }),
          )
          .named("with-profile"),
        where(
          Authenticating._getUser({ user }).is({ email }),
          whether(Authenticating._getUser({ user }).is({ name: accountName })),
          no(Profiling._getProfile({ user })),
          compute(computations.resolveDisplayName, { preferredName: null, accountName, email }, displayName),
        )
          .then(
            respond({
              email,
              accountName,
              displayName,
              preferredName: null,
              dietaryRestrictions: [],
              budgetPreferences: [],
              walkPreferenceMinutes: null,
              cuisinePreferences: [],
              notes: null,
            }),
          )
          .named("without-profile"),
      ),
  { input: { required: ["session"] } },
);

const SaveProfile = endpoint(
  "/api/profiles/save",
  ({
    session,
    preferredName,
    dietaryRestrictions,
    budgetPreferences,
    walkPreferenceMinutes,
    cuisinePreferences,
    notes,
    now,
    user,
  }) =>
    receive({
      session,
      preferredName,
      dietaryRestrictions,
      budgetPreferences,
      walkPreferenceMinutes,
      cuisinePreferences,
      notes,
    })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(
        Profiling.setProfile({
          user,
          preferredName,
          dietaryRestrictions,
          budgetPreferences,
          walkPreferenceMinutes,
          cuisinePreferences,
          notes,
        }),
      )
      .then(respond({ saved: true })),
  {
    input: {
      required: ["session"],
      defaults: {
        preferredName: null,
        dietaryRestrictions: [],
        budgetPreferences: [],
        walkPreferenceMinutes: null,
        cuisinePreferences: [],
        notes: null,
      },
    },
  },
);

const ClearProfile = endpoint(
  "/api/profiles/clear",
  ({ session, now, user }) =>
    receive({ session })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(Profiling.clearProfile({ user }))
      .then(respond({ cleared: true })),
  { input: { required: ["session"] } },
);

const ViewTableProfiles = endpoint(
  "/api/tables/profiles",
  ({ session, gathering, now, viewer, host, status, active, reserved }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: viewer })))
      .then(
        where(no(Hosting._getDetails({ gathering })))
          .then(respond({ error: "NO_SUCH_TABLE" }))
          .named("no-such-table"),
        where(
          Hosting._getDetails({ gathering }).is({ status }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [false]),
        )
          .then(respond({ error: "TABLE_INACTIVE" }))
          .named("table-inactive"),
        where(
          Hosting._getDetails({ gathering }).is({ status }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [true]),
          no(Hosting._getDetails({ gathering }).is({ host: viewer })),
          Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
          is.among(reserved, [false]),
        )
          .then(respond({ error: "NOT_PARTICIPANT" }))
          .named("not-participant"),
        where(
          Hosting._getDetails({ gathering }).is({ status, host: viewer }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [true]),
        )
          .then(respond({ host: ParticipantProfile({ user: viewer }), seated: SeatedProfiles({ gathering }) }))
          .named("host-viewer"),
        where(
          Hosting._getDetails({ gathering }).is({ status, host }),
          compute(computations.isActiveTableStatus, { status }, active),
          is.among(active, [true]),
          no(Hosting._getDetails({ gathering }).is({ host: viewer })),
          Reserving._hasReservation({ resource: gathering, user: viewer }).is({ reserved }),
          is.among(reserved, [true]),
        )
          .then(respond({ host: ParticipantProfile({ user: host }), seated: SeatedProfiles({ gathering }) }))
          .named("seated-viewer"),
      ),
  { input: { required: ["session", "gathering"] } },
);

export const profilesComposition = {
  Self: { GetProfile, SaveProfile, ClearProfile },
  Table: { ViewTableProfiles, ParticipantProfile, SeatedProfiles },
};
