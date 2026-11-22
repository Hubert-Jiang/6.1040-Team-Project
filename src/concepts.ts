import { conceptSet, registerConcept } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import hostingSpec from "@design/concepts/Hosting.md" with { type: "text" };
import reservingSpec from "@design/concepts/Reserving.md" with { type: "text" };
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

type Mongo = { database: Db };

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
  floors: { mongo: ({ database }: Mongo, name: string) => new HostingConcept(database, name) },
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
  floors: { mongo: ({ database }: Mongo, name: string) => new ReservingConcept(database, name) },
});

// each concept is registered above and listed here once
export const applicationConceptSet = conceptSet({
  Hosting: hosting,
  Reserving: reserving,
});
export const { concepts } = applicationConceptSet;
