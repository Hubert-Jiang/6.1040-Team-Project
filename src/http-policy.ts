import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const appHttpPolicy = httpPolicy({
  publicErrors: {
    INVALID_IDENTITY: "INVALID_REQUEST",
    EMAIL_CONFLICT: "CONFLICT",
    INVALID_RETURN_TO: "INVALID_REQUEST",
    INVALID_STATE: "INVALID_REQUEST",
    OIDC_EXCHANGE_FAILED: "UNAUTHORIZED",
    UNKNOWN_SESSION: "UNAUTHORIZED",
    HOST_LIMIT_REACHED: "CONFLICT",
    INVALID_SCHEDULE: "INVALID_REQUEST",
    INVALID_DETAILS: "INVALID_REQUEST",
    INVALID_POOL: "INVALID_REQUEST",
    // a table that does not exist and one hosted by someone else look the same from outside
    NO_SUCH_TABLE: "NOT_FOUND",
    NOT_HOST: "NOT_FOUND",
    CANNOT_CONFIRM: "CONFLICT",
    CANNOT_BOOK: "CONFLICT",
    CANNOT_CANCEL: "CONFLICT",
  },
});
