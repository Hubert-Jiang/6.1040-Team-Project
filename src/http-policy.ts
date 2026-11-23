import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const appHttpPolicy = httpPolicy({
  publicErrors: {
    INVALID_IDENTITY: "INVALID_REQUEST",
    EMAIL_CONFLICT: "CONFLICT",
    INVALID_RETURN_TO: "INVALID_REQUEST",
    INVALID_STATE: "INVALID_REQUEST",
    OIDC_EXCHANGE_FAILED: "UNAUTHORIZED",
    UNKNOWN_SESSION: "UNAUTHORIZED",
  },
});
