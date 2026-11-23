import { statSync } from "node:fs";
import path from "node:path";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import type { Db } from "mongodb";
import type { AppWire } from "../generated/wire.ts";
import { assembleApplication } from "./assembly.ts";
import type { PetrockClient } from "./auth/petrock.ts";
import { appHttpPolicy } from "./http-policy.ts";

const DEFAULT_WEB_DIST_DIR = path.resolve(import.meta.dir, "../web/dist");

function resolveSpaAsset(requestUrl: string, webDistDir: string): string | null {
  const root = path.resolve(webDistDir);
  const url = new URL(requestUrl);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const candidate = path.resolve(root, relative || "index.html");
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  try {
    if (statSync(candidate).isFile()) {
      return candidate;
    }
  } catch {
    // Fall through to SPA index.html for client-side routes like /login, /tables/xyz, /auth/petrock/callback
  }
  const indexFile = path.join(root, "index.html");
  try {
    if (statSync(indexFile).isFile()) {
      return indexFile;
    }
  } catch {
    return null;
  }
  return null;
}

export function createApplicationHttpHandler({
  database,
  petrock,
}: {
  database: Db;
  petrock?: PetrockClient;
}) {
  const application = assembleApplication({ database, petrock });
  const gateway = createGateway<AppWire>({ application });
  return createHttpHandler({ application, gateway, policy: appHttpPolicy });
}

export function startHost({
  hostname = "127.0.0.1",
  port = 8080,
  database,
  petrock,
  webDistDir = DEFAULT_WEB_DIST_DIR,
}: {
  hostname?: string;
  port?: number;
  database: Db;
  petrock?: PetrockClient;
  webDistDir?: string;
}) {
  const handler = createApplicationHttpHandler({ database, petrock });
  return Bun.serve({
    hostname,
    port,
    fetch: async (request) => {
      if (request.method === "GET" || request.method === "HEAD") {
        const assetPath = resolveSpaAsset(request.url, webDistDir);
        if (assetPath) {
          return new Response(Bun.file(assetPath));
        }
      }
      return handler(request);
    },
  });
}
