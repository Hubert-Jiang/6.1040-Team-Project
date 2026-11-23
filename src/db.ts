import { type Collection, type Db, type Document, MongoClient, MongoServerError } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

const DEFAULT_DATABASE_NAME = "sync_engine_demo";

/**
 * Resolves the target MongoDB database name from `MONGODB_DB`, then the database path in `uri`,
 * falling back to `sync_engine_demo` only when neither specifies one.
 */
export function resolveDatabaseName(uri: string, configuredDb?: string): string {
  const explicit = configuredDb?.trim();
  if (explicit) return explicit;

  const withoutAuthority = uri.replace(/^mongodb(?:\+srv)?:\/\/[^/]+/, "");
  const pathPart = withoutAuthority.split("?")[0] ?? "";
  const dbFromUri = pathPart.startsWith("/") ? decodeURIComponent(pathPart.slice(1)).trim() : "";
  return dbFromUri || DEFAULT_DATABASE_NAME;
}

/** Connects to `MONGODB_URI` (or `MONGODB_URL`) when configured, or an in-memory MongoDB server locally. */
export async function connectDatabase(env: Record<string, string | undefined> = process.env): Promise<{
  database: Db;
  close: () => Promise<void>;
}> {
  const uri = env.MONGODB_URI?.trim() || env.MONGODB_URL?.trim();
  if (uri) {
    const client = await new MongoClient(uri).connect();
    const dbName = resolveDatabaseName(uri, env.MONGODB_DB);
    return {
      database: client.db(dbName),
      close: () => client.close(),
    };
  }

  const memoryServer = await MongoMemoryServer.create();
  const client = await new MongoClient(memoryServer.getUri()).connect();
  return {
    database: client.db(DEFAULT_DATABASE_NAME),
    close: async () => {
      await client.close();
      await memoryServer.stop();
    },
  };
}

/**
 * Creates a single-field TTL index, replacing an existing conflicting index on that field
 * (for example, a pre-existing non-TTL index with the same key or name).
 */
export async function ensureTtlIndex<T extends Document>(
  collection: Collection<T>,
  field: string,
  expireAfterSeconds: number,
): Promise<void> {
  try {
    await collection.createIndex({ [field]: 1 }, { expireAfterSeconds });
  } catch (error) {
    if (!(error instanceof MongoServerError && (error.code === 85 || error.code === 86))) {
      throw error;
    }
    const indexes = await collection.indexes();
    const conflicting = indexes.find(
      (idx) =>
        typeof idx.name === "string" &&
        idx.name !== "_id_" &&
        ((Object.keys(idx.key).length === 1 && idx.key[field] === 1) || idx.name === `${field}_1`),
    );
    if (!conflicting?.name) throw error;
    await collection.dropIndex(conflicting.name);
    await collection.createIndex({ [field]: 1 }, { expireAfterSeconds });
  }
}
