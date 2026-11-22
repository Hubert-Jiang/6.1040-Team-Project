import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startHost } from "./host.ts";

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const client = await new MongoClient(uri).connect();
    return {
      database: client.db(process.env.MONGODB_DB ?? "sync_engine_demo"),
      close: () => client.close(),
    };
  }
  const memoryServer = await MongoMemoryServer.create();
  const client = await new MongoClient(memoryServer.getUri()).connect();
  return {
    database: client.db("sync_engine_demo"),
    close: async () => {
      await client.close();
      await memoryServer.stop();
    },
  };
}

const { database, close } = await connectDatabase();
const port = Number(process.env.PORT ?? 8080);
const hostname = process.env.HOST ?? "127.0.0.1";
const server = startHost({ hostname, port, database });

console.log(`Auth demo listening at http://${server.hostname}:${server.port}`);

const shutdown = async () => {
  server.stop(true);
  await close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
