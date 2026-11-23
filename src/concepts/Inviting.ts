import { type Collection, type Db, MongoServerError, ObjectId } from "mongodb";

export class AlreadyAccepted extends Error {}
export class NotAccepted extends Error {}
export class InvalidPendingKey extends Error {}

interface AcceptanceDoc {
  _id: string;
  event: string;
  guest: string;
}

interface PendingDoc {
  _id: string;
  event: string;
  pendingKey: string;
}

// ObjectId hex strings grow with time and with each id made in this process, so sorting by _id keeps the order things happened
const newId = () => new ObjectId().toHexString();

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

/** Who accepted which event, plus acceptances waiting for a signed-out guest to finish signing in. */
export class InvitingConcept {
  private readonly acceptances: Collection<AcceptanceDoc>;
  private readonly pending: Collection<PendingDoc>;
  private indexes: Promise<unknown> | undefined;

  constructor(database: Db, name = "Inviting") {
    const prefix = name.toLowerCase();
    this.acceptances = database.collection(`${prefix}.acceptances`);
    this.pending = database.collection(`${prefix}.pending`);
  }

  // The unique indexes are what make a double accept or a double defer impossible, even when two arrive at once.
  #ready() {
    this.indexes ??= Promise.all([
      this.acceptances.createIndex({ event: 1, guest: 1 }, { unique: true }),
      this.pending.createIndex({ event: 1, pendingKey: 1 }, { unique: true }),
      this.pending.createIndex({ pendingKey: 1 }),
    ]).catch((error: unknown) => {
      this.indexes = undefined;
      throw error;
    });
    return this.indexes;
  }

  /** Returns the guest's new acceptance. Raises AlreadyAccepted when they have one for this event. */
  async accept({ event, guest }: { event: string; guest: string }) {
    await this.#ready();
    const acceptance = newId();
    try {
      await this.acceptances.insertOne({ _id: acceptance, event, guest });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new AlreadyAccepted("You have already accepted this invitation.");
      throw error;
    }
    return { acceptance };
  }

  /** Removes the guest's acceptance, so they can accept again later. Raises NotAccepted when they have none. */
  async withdraw({ event, guest }: { event: string; guest: string }) {
    const { deletedCount } = await this.acceptances.deleteOne({ event, guest });
    if (!deletedCount) throw new NotAccepted("You have not accepted this invitation.");
    return {};
  }

  /** Records that whoever holds `pendingKey` wants to accept the event once signed in. Deferring twice is harmless. */
  async deferAccept({ event, pendingKey }: { event: string; pendingKey: string }) {
    const key = typeof pendingKey === "string" ? pendingKey.trim() : "";
    if (!key) throw new InvalidPendingKey("A non-empty pending key is required.");
    await this.#ready();
    // an upsert, so a repeat or a race leaves exactly one entry
    try {
      await this.pending.updateOne(
        { event, pendingKey: key },
        { $setOnInsert: { _id: newId() } },
        { upsert: true },
      );
    } catch (error) {
      // two upserts racing can both try to insert; the loser's entry already exists, which is the outcome we want
      if (!isDuplicateKeyError(error)) throw error;
    }
    return {};
  }

  /** Removes the pending acceptance for the event and key, if there is one. */
  async clearPending({ event, pendingKey }: { event: string; pendingKey: string }) {
    await this.pending.deleteOne({ event, pendingKey: typeof pendingKey === "string" ? pendingKey.trim() : pendingKey });
    return {};
  }

  /** Returns whether the guest has accepted the event, always in one row. */
  async _isAccepted({ event, guest }: { event: string; guest: string }) {
    return { accepted: (await this.acceptances.countDocuments({ event, guest }, { limit: 1 })) > 0 };
  }

  /** Returns every guest who accepted the event, earliest first. */
  async _getAcceptedGuests({ event }: { event: string }) {
    const rows = await this.acceptances.find({ event }).sort({ _id: 1 }).toArray();
    return rows.map(({ guest }) => ({ guest }));
  }

  /** Returns every event the key is waiting to accept, earliest first. */
  async _getPendingForKey({ pendingKey }: { pendingKey: string }) {
    const key = typeof pendingKey === "string" ? pendingKey.trim() : "";
    if (!key) return [];
    const rows = await this.pending.find({ pendingKey: key }).sort({ _id: 1 }).toArray();
    return rows.map(({ event }) => ({ event }));
  }
}
