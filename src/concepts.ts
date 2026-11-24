import { conceptSet, registerConcept } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import authenticatingSpec from "@design/concepts/Authenticating.md" with { type: "text" };
import hostingSpec from "@design/concepts/Hosting.md" with { type: "text" };
import invitingSpec from "@design/concepts/Inviting.md" with { type: "text" };
import linkingSpec from "@design/concepts/Linking.md" with { type: "text" };
import pollingSpec from "@design/concepts/Polling.md" with { type: "text" };
import profilingSpec from "@design/concepts/Profiling.md" with { type: "text" };
import reservingSpec from "@design/concepts/Reserving.md" with { type: "text" };
import sessioningSpec from "@design/concepts/Sessioning.md" with { type: "text" };
import { buildPetrockAuthorizationUrl, type PetrockClient } from "./auth/petrock.ts";
import {
  AuthenticatingConcept,
  EmailConflict,
  InvalidIdentity,
  InvalidReturnTo,
  InvalidState,
  OidcExchangeFailed,
} from "./concepts/Authenticating.ts";
import {
  CannotBook,
  CannotCancel as CannotCancelGathering,
  CannotConfirm,
  CannotSetVenue,
  HostingConcept,
  HostLimitReached,
  InvalidDetails,
  InvalidSchedule,
  NotHost,
} from "./concepts/Hosting.ts";
import { AlreadyAccepted, InvalidPendingKey, InvitingConcept, NotAccepted } from "./concepts/Inviting.ts";
import { InvalidExpiry, InvalidLabel, LinkingConcept, NotCreator } from "./concepts/Linking.ts";
import {
  DuplicateOption,
  InvalidOption,
  NoSuchOption,
  OptionLimitReached,
  PollingConcept,
} from "./concepts/Polling.ts";
import { InvalidDistance, InvalidProfile, ProfilingConcept } from "./concepts/Profiling.ts";
import {
  AlreadyInPool,
  AlreadyReserved,
  CannotCancel as CannotCancelReservation,
  InvalidPool,
  NoSuchReservation,
  PoolClosed,
  PoolFull,
  ReservingConcept,
  SpotsAvailable,
} from "./concepts/Reserving.ts";
import { InvalidSessionLifetime, SessioningConcept, UnknownSession } from "./concepts/Sessioning.ts";

export type MongoFloorContext = { database: Db; petrock?: PetrockClient };

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

function normalizeReturnToPath(raw?: string | null): string {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return "/";
  return trimmed;
}

// demo accounts for /auth/test-login. "guest" lets one person act as a second user in another browser window
const TEST_ACCOUNTS = {
  student: { email: "test-student@mit.edu", name: "Test Student", affiliation: "student" },
  guest: { email: "test-guest@mit.edu", name: "Test Guest", affiliation: "student" },
} as const;

/** The demo account by name; anything other than "guest" is the original test student. */
function testAccountOf(account?: string | null) {
  return account === "guest" ? TEST_ACCOUNTS.guest : TEST_ACCOUNTS.student;
}

// the most open seats one table can offer, besides the host's own
const MAX_CAPACITY = 50;


const authenticating = registerConcept({
  class: AuthenticatingConcept,
  spec: authenticatingSpec,
  refusals: {
    INVALID_IDENTITY: InvalidIdentity,
    EMAIL_CONFLICT: EmailConflict,
    INVALID_RETURN_TO: InvalidReturnTo,
    INVALID_STATE: InvalidState,
    OIDC_EXCHANGE_FAILED: OidcExchangeFailed,
  },
  floors: {
    mongo: ({ database, petrock }: MongoFloorContext, name: string) =>
      new AuthenticatingConcept(database, name, petrock),
  },
});

const sessioning = registerConcept({
  class: SessioningConcept,
  spec: sessioningSpec,
  refusals: {
    INVALID_SESSION_LIFETIME: InvalidSessionLifetime,
    UNKNOWN_SESSION: UnknownSession,
  },
  floors: {
    mongo: ({ database }: MongoFloorContext, name: string) => new SessioningConcept(database, name),
  },
});

const hosting = registerConcept({
  class: HostingConcept,
  spec: hostingSpec,
  refusals: {
    HOST_LIMIT_REACHED: HostLimitReached,
    INVALID_SCHEDULE: InvalidSchedule,
    INVALID_DETAILS: InvalidDetails,
    NOT_HOST: NotHost,
    CANNOT_CONFIRM: CannotConfirm,
    CANNOT_SET_VENUE: CannotSetVenue,
    CANNOT_BOOK: CannotBook,
    CANNOT_CANCEL: CannotCancelGathering,
  },
  floors: { mongo: ({ database }: MongoFloorContext, name: string) => new HostingConcept(database, name) },
});

const reserving = registerConcept({
  class: ReservingConcept,
  spec: reservingSpec,
  refusals: {
    INVALID_POOL: InvalidPool,
    POOL_CLOSED: PoolClosed,
    ALREADY_RESERVED: AlreadyReserved,
    POOL_FULL: PoolFull,
    SPOTS_AVAILABLE: SpotsAvailable,
    ALREADY_IN_POOL: AlreadyInPool,
    NO_SUCH_RESERVATION: NoSuchReservation,
    CANNOT_CANCEL: CannotCancelReservation,
  },
  floors: { mongo: ({ database }: MongoFloorContext, name: string) => new ReservingConcept(database, name) },
});

const linking = registerConcept({
  class: LinkingConcept,
  spec: linkingSpec,
  refusals: {
    INVALID_EXPIRY: InvalidExpiry,
    INVALID_LABEL: InvalidLabel,
    NOT_CREATOR: NotCreator,
  },
  floors: { mongo: ({ database }: MongoFloorContext, name: string) => new LinkingConcept(database, name) },
});

const inviting = registerConcept({
  class: InvitingConcept,
  spec: invitingSpec,
  refusals: {
    ALREADY_ACCEPTED: AlreadyAccepted,
    NOT_ACCEPTED: NotAccepted,
    INVALID_PENDING_KEY: InvalidPendingKey,
  },
  floors: { mongo: ({ database }: MongoFloorContext, name: string) => new InvitingConcept(database, name) },
});

const profiling = registerConcept({
  class: ProfilingConcept,
  spec: profilingSpec,
  refusals: {
    INVALID_DISTANCE: InvalidDistance,
    INVALID_PROFILE: InvalidProfile,
  },
  floors: { mongo: ({ database }: MongoFloorContext, name: string) => new ProfilingConcept(database, name) },
});

const polling = registerConcept({
  class: PollingConcept,
  spec: pollingSpec,
  refusals: {
    INVALID_OPTION: InvalidOption,
    DUPLICATE_OPTION: DuplicateOption,
    OPTION_LIMIT_REACHED: OptionLimitReached,
    NO_SUCH_OPTION: NoSuchOption,
  },
  floors: { mongo: ({ database }: MongoFloorContext, name: string) => new PollingConcept(database, name) },
});

// each concept is registered above and listed here once
export const applicationConceptSet = conceptSet(
  {
    Authenticating: authenticating,
    Sessioning: sessioning,
    Hosting: hosting,
    Reserving: reserving,
    Linking: linking,
    Inviting: inviting,
    Profiling: profiling,
    Polling: polling,
  },
  {
    now: (_input: Record<string, never>) => new Date(),
    parseTime: ({ raw }: { raw: string }) => new Date(raw),
    sessionLifetimeMs: (_input: Record<string, never>) => SESSION_LIFETIME_MS,
    hasSession: ({ session }: { session?: string | null }) =>
      typeof session === "string" && session.trim().length > 0,
    normalizeReturnTo: ({ raw }: { raw?: string | null }) => normalizeReturnToPath(raw),
    buildPetrockAuthUrl: ({ state }: { state: string }) => buildPetrockAuthorizationUrl(state),
    testLoginEnabled: (_input: Record<string, never>) =>
      process.env.ENABLE_TEST_LOGIN === "true" && process.env.NODE_ENV !== "production",
    testAccountExternalId: ({ account }: { account?: string | null }) => testAccountOf(account).email,
    testAccountEmail: ({ account }: { account?: string | null }) => testAccountOf(account).email,
    testAccountName: ({ account }: { account?: string | null }) => testAccountOf(account).name,
    testAccountAffiliation: ({ account }: { account?: string | null }) => testAccountOf(account).affiliation,
    hasText: ({ value }: { value?: string | null }) => typeof value === "string" && value.trim().length > 0,
    isValidCapacity: ({ capacity }: { capacity?: number | null }) =>
      typeof capacity === "number" && Number.isInteger(capacity) && capacity >= 1 && capacity <= MAX_CAPACITY,
    isValidLabel: ({ label }: { label?: string | null }) =>
      label == null || (typeof label === "string" && label.trim().length <= 80),
    isAcceptingGuests: ({ status, locked, cutoffTime, now }: { status: string; locked: boolean; cutoffTime: Date; now: Date }) =>
      (status === "OPEN" || status === "CONFIRMED") && !locked && now.getTime() <= new Date(cutoffTime).getTime(),
    resolveDisplayName: ({
      preferredName,
      accountName,
      email,
    }: {
      preferredName?: string | null;
      accountName?: string | null;
      email: string;
    }) => {
      const preferred = typeof preferredName === "string" ? preferredName.trim() : "";
      if (preferred.length > 0) return preferred;
      const account = typeof accountName === "string" ? accountName.trim() : "";
      if (account.length > 0) return account;
      return email;
    },
    isActiveTableStatus: ({ status }: { status: string }) =>
      status === "OPEN" || status === "CONFIRMED" || status === "BOOKED",
    matchesUser: ({ a, b }: { a: string; b: string }) => a === b,
    isPollOpen: ({ status, confirmedVenue }: { status: string; confirmedVenue?: string | null }) =>
      (status === "OPEN" || status === "CONFIRMED") && (confirmedVenue == null || confirmedVenue.trim().length === 0),
    canRemovePollOption: ({ hosting, proposedBy, viewer }: { hosting: boolean; proposedBy: string; viewer: string }) =>
      hosting || proposedBy === viewer,
  },
);

export const { concepts, computations } = applicationConceptSet;
