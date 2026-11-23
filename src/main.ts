import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { assembleApplication } from "./assembly.ts";
import { sweepCutoffs } from "./cutoffs.ts";
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

// how often tables are checked against their cutoff and end times, in milliseconds
const SWEEP_MS = 60_000;
// the sweep gets its own assembly on the same database, since the host keeps its one to itself
const sweeper = assembleApplication({ database });
const sweep = () => void sweepCutoffs(sweeper, new Date()).catch((error) => console.error(`Cutoff sweep failed: ${error}`));
// once at startup to catch up on anything missed while the server was down, then on a timer
sweep();
const sweeping = setInterval(sweep, SWEEP_MS);

const shutdown = async () => {
  clearInterval(sweeping);
  server.stop(true);
  await close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
