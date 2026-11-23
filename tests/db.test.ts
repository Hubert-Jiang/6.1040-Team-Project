import { expect, test } from "bun:test";
import { resolveDatabaseName } from "../src/db.ts";

test("resolveDatabaseName prefers explicit MONGODB_DB, then URI database path, then sync_engine_demo", () => {
  expect(resolveDatabaseName("mongodb+srv://user:pass@cluster.mongodb.net/seat?retryWrites=true")).toBe("seat");
  expect(resolveDatabaseName("mongodb://user:pass@127.0.0.1:27017/myapp?authSource=admin")).toBe("myapp");
  expect(resolveDatabaseName("mongodb://h1:27017,h2:27017/repdb?replicaSet=rs0")).toBe("repdb");
  expect(resolveDatabaseName("mongodb://user:pass@127.0.0.1:27017/seat", "  ")).toBe("seat");
  expect(resolveDatabaseName("mongodb://user:pass@127.0.0.1:27017/seat", "override_db")).toBe("override_db");
  expect(resolveDatabaseName("mongodb://127.0.0.1:27017")).toBe("sync_engine_demo");
  expect(resolveDatabaseName("mongodb://127.0.0.1:27017/?authSource=admin")).toBe("sync_engine_demo");
});
