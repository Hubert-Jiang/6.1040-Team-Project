import { type Collection, type Db, type Filter, MongoServerError, type UpdateFilter } from "mongodb";

export class HostLimitReached extends Error {}
export class InvalidSchedule extends Error {}
export class InvalidDetails extends Error {}
export class NotHost extends Error {}
export class CannotConfirm extends Error {}
export class CannotBook extends Error {}
export class CannotCancel extends Error {}

export type GatheringStatus = "OPEN" | "CONFIRMED" | "BOOKED" | "CLOSED" | "CANCELLED";

interface GatheringDoc {
  _id: string;
  host: string;
  title: string;
  status: GatheringStatus;
  startTime: Date;
  endTime: Date;
  cutoffTime: Date;
  details?: string;
  scope?: string;
  area: string;
  confirmedVenue?: string;
  // which of the host's active slots this gathering holds, present only while OPEN or CONFIRMED
  slot?: number;
}

// a host can have this many gatherings that are OPEN or CONFIRMED at once
const ACTIVE_LIMIT = 3;

// leaving OPEN or CONFIRMED gives the host's slot back in the same update as the status change
const freeSlot = { $unset: { slot: "" } } as const;

/** The lifecycle and basic details of meal gatherings, with a cap on how many a host keeps active. */
export class HostingConcept {
  private readonly gatherings: Collection<GatheringDoc>;
  private indexes: Promise<unknown> | undefined;

  constructor(database: Db, name = "Hosting") {
    this.gatherings = database.collection(`${name.toLowerCase()}.gatherings`);
  }

  // The unique index on (host, slot) is what enforces the active limit, even when two creates race.
  #ready() {
    this.indexes ??= this.gatherings
      .createIndex({ host: 1, slot: 1 }, { unique: true, partialFilterExpression: { slot: { $exists: true } } })
      .catch((error: unknown) => {
        this.indexes = undefined;
        throw error;
      });
    return this.indexes;
  }

  /** Applies `change` to the one gathering matching `filter`, and returns whether there was one. */
  async #move(filter: Filter<GatheringDoc>, change: UpdateFilter<GatheringDoc>): Promise<boolean> {
    const { matchedCount } = await this.gatherings.updateOne(filter, change);
    return matchedCount === 1;
  }

  /**
   * Returns the new OPEN gathering. Raises InvalidDetails for an empty title or area, InvalidSchedule unless
   * now < cutoffTime <= startTime < endTime, and HostLimitReached when the host already has 3 active gatherings.
   */
  async create(input: {
    host: string;
    title: string;
    startTime: Date;
    endTime: Date;
    cutoffTime: Date;
    details?: string;
    scope?: string;
    area: string;
    confirmedVenue?: string;
    now: Date;
  }) {
    const { host, startTime, endTime, cutoffTime, now } = input;
    const title = input.title.trim();
    const area = input.area.trim();
    if (!title || !area) throw new InvalidDetails("A gathering needs a title and an area.");
    // written so that an invalid date (NaN) fails every comparison and is refused too
    if (!(now < cutoffTime && cutoffTime <= startTime && startTime < endTime)) {
      throw new InvalidSchedule("Gathering requires valid future cutoff, start, and end times.");
    }

    // empty optional fields are left off the document, so they read back as absent
    const gathering: GatheringDoc = { _id: crypto.randomUUID(), host, title, status: "OPEN", startTime, endTime, cutoffTime, area };
    if (input.details?.trim()) gathering.details = input.details.trim();
    if (input.scope?.trim()) gathering.scope = input.scope.trim();
    if (input.confirmedVenue?.trim()) gathering.confirmedVenue = input.confirmedVenue.trim();

    // takes the first free slot; all of them taken means the host is at the limit
    await this.#ready();
    for (let slot = 0; slot < ACTIVE_LIMIT; slot++) {
      try {
        await this.gatherings.insertOne({ ...gathering, slot });
        return { gathering: gathering._id };
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      }
    }
    throw new HostLimitReached("You already have the maximum number of active unbooked gatherings.");
  }

  /** Marks an OPEN gathering CONFIRMED. Raises NotHost for anyone but its host, and CannotConfirm after the cutoff or once it is no longer OPEN. */
  async confirm({ gathering, host, now }: { gathering: string; host: string; now: Date }) {
    if (await this.#move({ _id: gathering, host, status: "OPEN", cutoffTime: { $gte: now } }, { $set: { status: "CONFIRMED" } })) return {};
    if (!(await this.gatherings.findOne({ _id: gathering, host }))) throw new NotHost("Only the gathering's host can confirm it.");
    throw new CannotConfirm("This gathering can no longer be confirmed.");
  }

  /** Sets the venue of an OPEN or CONFIRMED gathering. The spec has no refusal here, so anything else is a plain error. */
  async setVenue({ gathering, confirmedVenue }: { gathering: string; confirmedVenue: string }) {
    const venue = confirmedVenue.trim();
    if (venue && (await this.#move({ _id: gathering, status: { $in: ["OPEN", "CONFIRMED"] } }, { $set: { confirmedVenue: venue } }))) return {};
    throw new Error(`cannot set the venue of gathering ${gathering}`);
  }

  /** Marks a CONFIRMED gathering with a venue BOOKED. Raises NotHost for anyone but its host, and CannotBook otherwise. */
  async markBooked({ gathering, host }: { gathering: string; host: string }) {
    const booked = await this.#move(
      { _id: gathering, host, status: "CONFIRMED", confirmedVenue: { $exists: true } },
      { $set: { status: "BOOKED" }, ...freeSlot },
    );
    if (booked) return {};
    if (!(await this.gatherings.findOne({ _id: gathering, host }))) throw new NotHost("Only the gathering's host can mark it booked.");
    throw new CannotBook("Confirm the gathering and set a venue before marking it booked.");
  }

  /** Cancels a gathering that has not ended. Raises NotHost for anyone but its host, and CannotCancel once it is CLOSED or CANCELLED. */
  async cancel({ gathering, host, now: _now }: { gathering: string; host: string; now: Date }) {
    // `now` decides nothing here; the spec carries it so the reactions that follow a cancel can use it
    const cancelled = await this.#move(
      { _id: gathering, host, status: { $in: ["OPEN", "CONFIRMED", "BOOKED"] } },
      { $set: { status: "CANCELLED" }, ...freeSlot },
    );
    if (cancelled) return {};
    if (!(await this.gatherings.findOne({ _id: gathering, host }))) throw new NotHost("Only the gathering's host can cancel this gathering.");
    throw new CannotCancel("This gathering has already ended or been cancelled.");
  }

  /** Closes an OPEN gathering whose cutoff has passed. The spec has no refusal here, so anything else is a plain error. */
  async expireUnconfirmed({ gathering, now }: { gathering: string; now: Date }) {
    if (await this.#move({ _id: gathering, status: "OPEN", cutoffTime: { $lt: now } }, { $set: { status: "CLOSED" }, ...freeSlot })) return {};
    throw new Error(`gathering ${gathering} is not an unconfirmed gathering past its cutoff`);
  }

  /** Closes a CONFIRMED or BOOKED gathering whose time window has ended. The spec has no refusal here, so anything else is a plain error. */
  async closeEnded({ gathering, now }: { gathering: string; now: Date }) {
    const closed = await this.#move(
      { _id: gathering, status: { $in: ["CONFIRMED", "BOOKED"] }, endTime: { $lte: now } },
      { $set: { status: "CLOSED" }, ...freeSlot },
    );
    if (closed) return {};
    throw new Error(`gathering ${gathering} is not a confirmed gathering past its end`);
  }

  /** Returns the gathering's details in one row, or no rows when there is no such gathering. */
  async _getDetails({ gathering }: { gathering: string }) {
    const found = await this.gatherings.findOne({ _id: gathering });
    if (!found) return [];
    const { host, title, status, startTime, endTime, cutoffTime, details, scope, area, confirmedVenue } = found;
    return [{ host, title, status, startTime, endTime, cutoffTime, details, scope, area, confirmedVenue }];
  }

  /** Returns every gathering of the host in any status, latest start first, so a host can find their tables again. */
  async _getHosted({ host }: { host: string }) {
    const rows = await this.gatherings.find({ host }).sort({ startTime: -1, _id: 1 }).toArray();
    return rows.map(({ _id, title, status, startTime }) => ({ gathering: _id, title, status, startTime }));
  }

  /**
   * Returns the gatherings whose cutoff needs handling, earliest cutoff first. Those are the OPEN ones
   * to expire (cutoff strictly passed) and the CONFIRMED or BOOKED ones whose seats freeze (cutoff reached).
   * A CONFIRMED or BOOKED gathering stays in the answer until it closes, so the caller checks whether it is handled already.
   */
  async _getPastCutoff({ now }: { now: Date }) {
    const rows = await this.gatherings
      .find({ $or: [{ status: "OPEN", cutoffTime: { $lt: now } }, { status: { $in: ["CONFIRMED", "BOOKED"] }, cutoffTime: { $lte: now } }] })
      .sort({ cutoffTime: 1, _id: 1 })
      .toArray();
    return rows.map(({ _id, status }) => ({ gathering: _id, status }));
  }

  /** Returns the CONFIRMED and BOOKED gatherings whose time window has ended, earliest end first, which are the ones to close. */
  async _getEnded({ now }: { now: Date }) {
    const rows = await this.gatherings
      .find({ status: { $in: ["CONFIRMED", "BOOKED"] }, endTime: { $lte: now } })
      .sort({ endTime: 1, _id: 1 })
      .toArray();
    return rows.map(({ _id }) => ({ gathering: _id }));
  }
}
