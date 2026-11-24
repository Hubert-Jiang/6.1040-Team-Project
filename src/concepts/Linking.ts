import { randomBytes } from "node:crypto";
import { type Collection, type Db, MongoServerError } from "mongodb";

export class InvalidExpiry extends Error {}
export class InvalidLabel extends Error {}
export class NotCreator extends Error {}

interface LinkDoc {
  _id: string;
  token: string;
  target: string;
  creator: string;
  label?: string;
  active: boolean;
  expiresAt?: Date;
  createdAt: Date;
}

// how many times createLink retries when a fresh token collides with an existing one
const TOKEN_ATTEMPTS = 3;
const MAX_LABEL_LENGTH = 80;

/** Unguessable shareable links that resolve to a target, each one revocable on its own. */
export class LinkingConcept {
  private readonly links: Collection<LinkDoc>;
  private indexes: Promise<unknown> | undefined;

  constructor(database: Db, name = "Linking") {
    this.links = database.collection(`${name.toLowerCase()}.links`);
  }

  #ready() {
    this.indexes ??= Promise.all([
      this.links.createIndex({ token: 1 }, { unique: true }),
      this.links.createIndex({ target: 1 }),
    ]).catch((error: unknown) => {
      this.indexes = undefined;
      throw error;
    });
    return this.indexes;
  }

  /**
   * Returns a new active link and its token. Raises InvalidExpiry when expiresAt is not after now,
   * and InvalidLabel when trimmed label exceeds 80 characters.
   */
  async createLink(input: { target: string; creator: string; label?: string; expiresAt?: Date; now: Date }) {
    const { target, creator, expiresAt, now } = input;
    // written so that an invalid date (NaN) fails the comparison and is refused too
    if (expiresAt !== undefined && expiresAt !== null && !(expiresAt > now)) {
      throw new InvalidExpiry("Link expiration must be in the future.");
    }

    const label = input.label?.trim();
    if (label && label.length > MAX_LABEL_LENGTH) {
      throw new InvalidLabel("Link label must be 80 characters or fewer.");
    }

    // empty optional fields are left off the document, so they read back as absent
    const link: Omit<LinkDoc, "token"> = { _id: crypto.randomUUID(), target, creator, active: true, createdAt: now };
    if (label) link.label = label;
    if (expiresAt) link.expiresAt = expiresAt;

    await this.#ready();
    for (let attempt = 1; ; attempt++) {
      // 24 random bytes is 192 bits, so a collision is practically impossible; the retry is only a guard
      const token = randomBytes(24).toString("base64url");
      try {
        await this.links.insertOne({ ...link, token });
        return { link: link._id, token };
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000) || attempt >= TOKEN_ATTEMPTS) throw error;
      }
    }
  }

  /** Turns the link off. Raises NotCreator for an unknown link or anyone but its creator. Revoking twice is harmless. */
  async revokeLink({ link, creator }: { link: string; creator: string }) {
    const { matchedCount } = await this.links.updateOne({ _id: link, creator }, { $set: { active: false } });
    if (!matchedCount) throw new NotCreator("Only the link creator can revoke this link.");
    return {};
  }

  /** Turns the link on. Raises NotCreator for an unknown link or anyone but its creator. Activating twice is harmless. */
  async activateLink({ link, creator }: { link: string; creator: string }) {
    const { matchedCount } = await this.links.updateOne({ _id: link, creator }, { $set: { active: true } });
    if (!matchedCount) throw new NotCreator("Only the link creator can activate this link.");
    return {};
  }

  /** Turns off every link to the target. */
  async revokeAllForTarget({ target }: { target: string }) {
    await this.links.updateMany({ target, active: true }, { $set: { active: false } });
    return {};
  }

  /** Returns the target and link of an active, unexpired token in one row, or no rows otherwise. */
  async _resolve({ token, now }: { token: string; now: Date }) {
    if (typeof token !== "string" || !token) return [];
    const found = await this.links.findOne({
      token,
      active: true,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    });
    return found ? [{ target: found.target, link: found._id }] : [];
  }

  /** Returns every link to the target, active links first and then oldest first. */
  async _listForTarget({ target }: { target: string }) {
    const rows = await this.links.find({ target }).sort({ active: -1, createdAt: 1, _id: 1 }).toArray();
    return rows.map(({ _id, token, label, active, expiresAt }) => ({ link: _id, token, label, active, expiresAt }));
  }
}
