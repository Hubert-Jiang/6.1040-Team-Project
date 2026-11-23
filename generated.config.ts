import { httpWire } from "@mit-sdg/sync-engine-http/tooling";
import { assembleApplication } from "./src/assembly.ts";
import { appHttpPolicy } from "./src/http-policy.ts";

export default {
  assemble: assembleApplication,
  title: "6.1040 Team Project",
  wireName: "AppWire",
  design: {
    version: 1,
    documents: [
      new URL("./design/types.md", import.meta.url),
      new URL("./design/compositions/Auth.md", import.meta.url),
    ],
  },
  projections: [httpWire({ policy: appHttpPolicy, name: "AppWireHttp" })],
};
