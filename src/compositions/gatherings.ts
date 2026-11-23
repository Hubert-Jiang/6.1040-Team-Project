import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, form, former, no, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const { Sessioning, Hosting, Reserving } = concepts;

// Every endpoint here starts with Sessioning.current, so the host is always the signed-in user
// and a request can never name someone else as the host.

/** Returns a validator that passes when every key in `text` is a string and `extra` also holds. */
function inputOf(text: string[], extra: (input: Record<string, unknown>) => boolean = () => true) {
  return (value: unknown) => {
    const input = value as Record<string, unknown>;
    return text.every((key) => typeof input[key] === "string") && extra(input) ? { ok: true as const } : { ok: false as const };
  };
}

// a table needs at least one guest spot. Checked before anything is created, since a refused pool
// after a successful create would leave a gathering nobody can join.
const createInput = inputOf(
  ["session", "title", "area", "startTime", "endTime", "cutoffTime", "details", "confirmedVenue"],
  ({ capacity }) => Number.isInteger(capacity) && (capacity as number) >= 1,
);
const tableInput = inputOf(["session", "gathering"]);

const Create = endpoint(
  "/gatherings/create",
  ({ session, title, area, startTime, endTime, cutoffTime, details, confirmedVenue, capacity, now, start, end, cutoff, user, gathering }) =>
    receive({ session, title, area, startTime, endTime, cutoffTime, details, confirmedVenue, capacity })
      .then(
        where(
          compute(computations.now, {}, now),
          compute(computations.parseTime, { raw: startTime }, start),
          compute(computations.parseTime, { raw: endTime }, end),
          compute(computations.parseTime, { raw: cutoffTime }, cutoff),
        ).then(Sessioning.current({ session, now }).responds({ subject: user })),
      )
      .then(
        Hosting.create({ host: user, title, area, startTime: start, endTime: end, cutoffTime: cutoff, details, confirmedVenue, now }).responds({ gathering }),
      )
      .then(Reserving.openPool({ resource: gathering, capacity }).responds({}))
      .then(respond({ gathering })),
  {
    input: {
      required: ["session", "title", "area", "startTime", "endTime", "cutoffTime", "capacity"],
      defaults: { details: "", confirmedVenue: "" },
    },
    validators: { input: createInput },
  },
);

const Hosted = former("the gatherings hosted by (host)", ({ host }, { gathering, title, status, startTime }) =>
  form({
    tables: each(Hosting._getHosted({ host }).is({ gathering, title, status, startTime })).form({ gathering, title, status, startTime }),
  }),
);

const Mine = endpoint(
  "/gatherings/mine",
  ({ session, now, user }) =>
    receive({ session })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(respond({ hosted: Hosted({ host: user }) })),
  { input: { required: ["session"] }, validators: { input: inputOf(["session"]) } },
);

const View = endpoint(
  "/gatherings/view",
  ({ session, gathering, now, user, title, status, startTime, endTime, cutoffTime, details, area, confirmedVenue, capacity, reservedCount, remaining, waitlistCount, locked }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(
        where(
          Hosting._getDetails({ gathering }).is({ host: user, title, status, startTime, endTime, cutoffTime, details, area, confirmedVenue }),
          Reserving._getAvailability({ resource: gathering }).is({ capacity, reservedCount, remaining, waitlistCount, locked }),
        )
          .then(respond({ title, status, startTime, endTime, cutoffTime, details, area, confirmedVenue, capacity, reservedCount, remaining, waitlistCount, locked }))
          .named("own-table"),
        // a table that does not exist and one hosted by someone else get the same answer
        where(no(Hosting._getDetails({ gathering }).is({ host: user })))
          .then(respond({ error: "NO_SUCH_TABLE" }))
          .named("not-own-table"),
        // every gathering gets a pool at creation, so this only answers if that ever failed, where the request would otherwise hang
        where(Hosting._getDetails({ gathering }).is({ host: user }), no(Reserving._getAvailability({ resource: gathering })))
          .then(respond({ error: "NO_SUCH_TABLE" }))
          .named("no-pool"),
      ),
  { input: { required: ["session", "gathering"] }, validators: { input: tableInput } },
);

const Confirm = endpoint(
  "/gatherings/confirm",
  ({ session, gathering, now, user }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(Hosting.confirm({ gathering, host: user, now }).responds({}))
      .then(respond({})),
  { input: { required: ["session", "gathering"] }, validators: { input: tableInput } },
);

const MarkBooked = endpoint(
  "/gatherings/book",
  ({ session, gathering, now, user }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(Hosting.markBooked({ gathering, host: user }).responds({}))
      .then(respond({})),
  { input: { required: ["session", "gathering"] }, validators: { input: tableInput } },
);

// a cancelled table takes no more reservations, so its pool is locked before the answer goes out
const Cancel = endpoint(
  "/gatherings/cancel",
  ({ session, gathering, now, user }) =>
    receive({ session, gathering })
      .then(where(compute(computations.now, {}, now)).then(Sessioning.current({ session, now }).responds({ subject: user })))
      .then(Hosting.cancel({ gathering, host: user, now }).responds({}))
      .then(Reserving.lock({ resource: gathering }).responds({}))
      .then(respond({})),
  { input: { required: ["session", "gathering"] }, validators: { input: tableInput } },
);

export const gatheringsComposition = {
  Creating: { Create },
  Viewing: { Hosted, Mine, View },
  Managing: { Confirm, MarkBooked, Cancel },
};
