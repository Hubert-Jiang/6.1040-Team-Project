import { assemble } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import type { PetrockClient } from "./auth/petrock.ts";
import { authComposition } from "./compositions/auth.ts";
import { applicationConceptSet } from "./concepts.ts";

// Allows static artifact generation (`sync-engine artifacts pin`) without opening a live Mongo connection.
const inspectionDb = { collection: () => ({}) } as unknown as Db;

export function assembleApplication({
  database = inspectionDb,
  petrock,
}: { database?: Db; petrock?: PetrockClient } = {}) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: applicationConceptSet.implementations("mongo", { database, petrock }),
    composition: { Auth: authComposition },
  });
}
