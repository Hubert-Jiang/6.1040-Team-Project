import { conceptSet, registerConcept } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import authenticatingSpec from "@design/concepts/Authenticating.md" with { type: "text" };
import hostingSpec from "@design/concepts/Hosting.md" with { type: "text" };
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
  HostingConcept,
  HostLimitReached,
  InvalidDetails,
  InvalidSchedule,
  NotHost,
} from "./concepts/Hosting.ts";
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

// each concept is registered above and listed here once
export const applicationConceptSet = conceptSet(
  {
    Authenticating: authenticating,
    Sessioning: sessioning,
    Hosting: hosting,
    Reserving: reserving,
  },
  {
    now: (_input: Record<string, never>) => new Date(),
    parseTime: ({ raw }: { raw: string }) => new Date(raw),
    sessionLifetimeMs: (_input: Record<string, never>) => SESSION_LIFETIME_MS,
    hasSession: ({ session }: { session?: string | null }) =>
      typeof session === "string" && session.trim().length > 0,
    normalizeReturnTo: ({ raw }: { raw?: string | null }) => normalizeReturnToPath(raw),
    buildPetrockAuthUrl: ({ state }: { state: string }) => buildPetrockAuthorizationUrl(state),
    testAccountExternalId: (_input: Record<string, never>) => "test-student@mit.edu",
    testAccountEmail: (_input: Record<string, never>) => "test-student@mit.edu",
    testAccountName: (_input: Record<string, never>) => "Test Student",
    testAccountAffiliation: (_input: Record<string, never>) => "student",
  },
);

export const { concepts, computations } = applicationConceptSet;
