import { randomBytes, randomUUID } from "node:crypto";
import { type Collection, type Db, MongoServerError } from "mongodb";
import { defaultPetrockClient, type PetrockClient } from "../auth/petrock.ts";

export class InvalidIdentity extends Error {}
export class EmailConflict extends Error {}
export class InvalidReturnTo extends Error {}
export class InvalidState extends Error {}
export class OidcExchangeFailed extends Error {}

interface UserDoc {
  _id: string;
  externalId: string;
  email: string;
  domain: string;
  name?: string;
  affiliation?: string;
}

interface OidcStateDoc {
  _id: string;
  state: string;
  returnTo: string;
  expiresAt: Date;
}

const OIDC_STATE_TTL_MS = 10 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSafeRelativeReturnTo(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  return true;
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

/** Authenticates users via MIT Touchstone/Petrock OIDC or demo credentials and tracks single-use OIDC state. */
export class AuthenticatingConcept {
  readonly #users: Collection<UserDoc>;
  readonly #states: Collection<OidcStateDoc>;
  readonly #petrock: PetrockClient;
  #indexes: Promise<unknown> | undefined;

  constructor(database: Db, name = "Authenticating", petrock: PetrockClient = defaultPetrockClient) {
    const prefix = name.toLowerCase();
    this.#users = database.collection(`${prefix}.users`);
    this.#states = database.collection(`${prefix}.oidc_states`);
    this.#petrock = petrock;
  }

  #ready() {
    this.#indexes ??= Promise.all([
      this.#users.createIndex({ externalId: 1 }, { unique: true }),
      this.#users.createIndex({ email: 1 }, { unique: true }),
      this.#states.createIndex({ state: 1 }, { unique: true }),
    ]).catch((error: unknown) => {
      this.#indexes = undefined;
      throw error;
    });
    return this.#indexes;
  }

  async authenticate({
    externalId,
    email,
    name,
    affiliation,
  }: {
    externalId: string;
    email: string;
    name?: string;
    affiliation?: string;
  }): Promise<{ user: string }> {
    const cleanExternalId = externalId.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanExternalId || !EMAIL_PATTERN.test(cleanEmail)) {
      throw new InvalidIdentity("A valid external identifier and email address are required.");
    }
    const domain = cleanEmail.slice(cleanEmail.indexOf("@") + 1);
    const cleanName = name?.trim() || undefined;
    const cleanAffiliation = affiliation?.trim() || undefined;

    await this.#ready();

    const setFields: Partial<UserDoc> = { email: cleanEmail, domain };
    const unsetFields: Record<string, ""> = {};
    if (cleanName !== undefined) setFields.name = cleanName;
    else unsetFields.name = "";
    if (cleanAffiliation !== undefined) setFields.affiliation = cleanAffiliation;
    else unsetFields.affiliation = "";

    const updateDoc =
      Object.keys(unsetFields).length > 0
        ? { $set: setFields, $unset: unsetFields, $setOnInsert: { _id: randomUUID(), externalId: cleanExternalId } }
        : { $set: setFields, $setOnInsert: { _id: randomUUID(), externalId: cleanExternalId } };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const doc = await this.#users.findOneAndUpdate(
          { externalId: cleanExternalId },
          updateDoc,
          { upsert: true, returnDocument: "after" },
        );
        if (doc) return { user: doc._id };
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const ownerByEmail = await this.#users.findOne({ email: cleanEmail });
        if (ownerByEmail && ownerByEmail.externalId !== cleanExternalId) {
          throw new EmailConflict("That email address is already linked to another external identity.");
        }
        // Concurrent insert for the same externalId; retry update once.
      }
    }
    throw new EmailConflict("That email address is already linked to another external identity.");
  }

  async beginOidc({ returnTo, now }: { returnTo: string; now: Date }): Promise<{ state: string }> {
    if (!isSafeRelativeReturnTo(returnTo)) {
      throw new InvalidReturnTo("Return path must be a relative application path.");
    }
    await this.#ready();
    const state = randomBytes(24).toString("base64url");
    await this.#states.insertOne({
      _id: randomUUID(),
      state,
      returnTo,
      expiresAt: new Date(now.getTime() + OIDC_STATE_TTL_MS),
    });
    return { state };
  }

  async consumeOidc({ state, now }: { state: string; now: Date }): Promise<{ returnTo: string }> {
    if (!state.trim()) {
      throw new InvalidState("Login state is invalid or has expired; please try signing in again.");
    }
    await this.#ready();
    const deleted = await this.#states.findOneAndDelete({
      state,
      expiresAt: { $gt: now },
    });
    if (!deleted) {
      throw new InvalidState("Login state is invalid or has expired; please try signing in again.");
    }
    return { returnTo: deleted.returnTo };
  }

  async verifyOidcCode({
    code,
  }: {
    code: string;
  }): Promise<{ externalId: string; email: string; name?: string; affiliation?: string }> {
    if (!code.trim()) {
      throw new OidcExchangeFailed("Could not verify identity with MIT Touchstone via Petrock.");
    }
    try {
      const info = await this.#petrock.exchangeCode(code);
      if (!info.externalId.trim() || !EMAIL_PATTERN.test(info.email.trim())) {
        throw new OidcExchangeFailed("Could not verify identity with MIT Touchstone via Petrock.");
      }
      return {
        externalId: info.externalId.trim(),
        email: info.email.trim().toLowerCase(),
        ...(info.name ? { name: info.name } : {}),
        ...(info.affiliation ? { affiliation: info.affiliation } : {}),
      };
    } catch (error) {
      if (error instanceof OidcExchangeFailed) throw error;
      throw new OidcExchangeFailed("Could not verify identity with MIT Touchstone via Petrock.");
    }
  }

  async _getUser({
    user,
  }: {
    user: string;
  }): Promise<Array<{ externalId: string; email: string; domain: string; name?: string; affiliation?: string }>> {
    const doc = await this.#users.findOne({ _id: user });
    if (!doc) return [];
    return [
      {
        externalId: doc.externalId,
        email: doc.email,
        domain: doc.domain,
        ...(doc.name !== undefined ? { name: doc.name } : {}),
        ...(doc.affiliation !== undefined ? { affiliation: doc.affiliation } : {}),
      },
    ];
  }

  async _hasDomain({ user, domain }: { user: string; domain: string }): Promise<{ matches: boolean }> {
    const doc = await this.#users.findOne({ _id: user });
    return { matches: doc ? doc.domain.toLowerCase() === domain.trim().toLowerCase() : false };
  }
}
