import { randomBytes } from "node:crypto";
import type { Collection, Db } from "mongodb";

export class InvalidSessionLifetime extends Error {}
export class UnknownSession extends Error {}

interface SessionDoc {
  _id: string;
  subject: string;
  expiresAt: Date;
}

/** Issues, validates, and ends opaque expiring sessions for external subjects. */
export class SessioningConcept {
  readonly #sessions: Collection<SessionDoc>;

  constructor(database: Db, name = "Sessioning") {
    this.#sessions = database.collection(`${name.toLowerCase()}.sessions`);
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
    const session = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + lifetime);
    await this.#sessions.insertOne({ _id: session, subject, expiresAt });
    return { session, expiresAt };
  }

  async current({ session, now }: { session: string; now: Date }): Promise<{ subject: string }> {
    if (!session) {
      throw new UnknownSession("This session is not active.");
    }
    const doc = await this.#sessions.findOne({ _id: session, expiresAt: { $gt: now } });
    if (!doc) {
      throw new UnknownSession("This session is not active.");
    }
    return { subject: doc.subject };
  }

  async end({ session, now }: { session: string; now: Date }): Promise<{ ended: boolean }> {
    if (!session) {
      throw new UnknownSession("This session is not active.");
    }
    const deleted = await this.#sessions.findOneAndDelete({ _id: session, expiresAt: { $gt: now } });
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
    const doc = await this.#sessions.findOne({ _id: session, expiresAt: { $gt: now } });
    return doc ? [{ subject: doc.subject, expiresAt: doc.expiresAt }] : [];
  }
}
