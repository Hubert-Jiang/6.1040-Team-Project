import { createHash, randomBytes } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { ensureTtlIndex } from "../db.ts";

export class InvalidSessionLifetime extends Error {}
export class UnknownSession extends Error {}

interface SessionDoc {
  _id: string;
  subject: string;
  expiresAt: Date;
}

function hashSessionToken(session: string): string {
  return createHash("sha256").update(session).digest("hex");
}

/** Issues, validates, and ends opaque expiring sessions for external subjects. */
export class SessioningConcept {
  readonly #sessions: Collection<SessionDoc>;
  #indexes: Promise<unknown> | undefined;

  constructor(database: Db, name = "Sessioning") {
    this.#sessions = database.collection(`${name.toLowerCase()}.sessions`);
  }

  #ready() {
    this.#indexes ??= ensureTtlIndex(this.#sessions, "expiresAt", 0).catch((error: unknown) => {
      this.#indexes = undefined;
      throw error;
    });
    return this.#indexes;
  }

  async start({
    subject,
    lifetime,
    now,
  }: {
    subject: string;
    lifetime: number;
    now: Date;
  }): Promise<{ session: string; expiresAt: Date }> {
    if (!Number.isFinite(lifetime) || lifetime <= 0) {
      throw new InvalidSessionLifetime("A session lifetime must be a positive number of milliseconds.");
    }
    await this.#ready();
    const session = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + lifetime);
    await this.#sessions.insertOne({ _id: hashSessionToken(session), subject, expiresAt });
    return { session, expiresAt };
  }

  async current({ session, now }: { session: string; now: Date }): Promise<{ subject: string }> {
    if (!session) {
      throw new UnknownSession("This session is not active.");
    }
    await this.#ready();
    const doc = await this.#sessions.findOne({ _id: hashSessionToken(session), expiresAt: { $gt: now } });
    if (!doc) {
      throw new UnknownSession("This session is not active.");
    }
    return { subject: doc.subject };
  }

  async end({ session, now }: { session: string; now: Date }): Promise<{ ended: boolean }> {
    if (!session) {
      throw new UnknownSession("This session is not active.");
    }
    await this.#ready();
    const deleted = await this.#sessions.findOneAndDelete({
      _id: hashSessionToken(session),
      expiresAt: { $gt: now },
    });
    if (!deleted) {
      throw new UnknownSession("This session is not active.");
    }
    return { ended: true };
  }

  async _active({
    session,
    now,
  }: {
    session: string;
    now: Date;
  }): Promise<Array<{ subject: string; expiresAt: Date }>> {
    if (!session) return [];
    await this.#ready();
    const doc = await this.#sessions.findOne({ _id: hashSessionToken(session), expiresAt: { $gt: now } });
    return doc ? [{ subject: doc.subject, expiresAt: doc.expiresAt }] : [];
  }
}
