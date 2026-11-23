import { assembleApplication } from "./assembly.ts";
import { readPetrockConfig } from "./auth/petrock.ts";
import { sweepCutoffs } from "./cutoffs.ts";
import { connectDatabase } from "./db.ts";
import { startHost } from "./host.ts";

const { database, close } = await connectDatabase();
const port = Number(process.env.PORT ?? 8080);
const hostname = process.env.HOST ?? "127.0.0.1";
const server = startHost({ hostname, port, database });
const petrock = readPetrockConfig();

console.log(`Server listening at http://${server.hostname}:${server.port} (db: ${database.databaseName})`);
console.log(
  `Petrock OIDC config: authority=${petrock.authority} redirectUri=${petrock.redirectUri} clientId=${petrock.clientId || "<missing>"} clientSecret=${petrock.clientSecret ? "<set>" : "<missing>"}`,
);
if (!petrock.clientId || !petrock.clientSecret) {
  console.warn("Warning: PETROCK_CLIENT_ID or PETROCK_CLIENT_SECRET is missing; MIT Touchstone sign-in will fail.");
}

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
