import { type Collection, type Db, type Filter, MongoServerError } from "mongodb";

export class InvalidPool extends Error {}
export class PoolClosed extends Error {}
export class AlreadyReserved extends Error {}
export class PoolFull extends Error {}
export class SpotsAvailable extends Error {}
export class AlreadyInPool extends Error {}
export class NoSuchReservation extends Error {}
export class CannotCancel extends Error {}

// A pool keeps its reservations and waitlist inside its own document. Every action is then a single
// conditional update on that document, which is what keeps the headcount exact when requests race.
interface PoolDoc {
  // the resource, so a resource has at most one pool
  _id: string;
  capacity: number;
  locked: boolean;
  reserved: { reservation: string; user: string }[];
  waitlist: string[];
}

// matches a pool that still has an open spot
const hasRoom = { $expr: { $lt: [{ $size: "$reserved" }, "$capacity"] } };
// matches a pool with every spot taken
const isFull = { $expr: { $eq: [{ $size: "$reserved" }, "$capacity"] } };

/** Bounded pools of reservations with a FIFO waitlist, for any resource with a fixed number of spots. */
export class ReservingConcept {
  private readonly pools: Collection<PoolDoc>;

  constructor(database: Db, name = "Reserving") {
    this.pools = database.collection(`${name.toLowerCase()}.pools`);
  }

  /** Returns the pool of `resource`. Raises a plain error when there is none, which the spec has no refusal for. */
  async #pool(resource: string): Promise<PoolDoc> {
    const pool = await this.pools.findOne({ _id: resource });
    if (!pool) throw new Error(`no reservation pool for ${resource}`);
    return pool;
  }

  /** Opens an unlocked, empty pool. Raises InvalidPool for a capacity below 1 or a resource that already has a pool. */
  async openPool({ resource, capacity }: { resource: string; capacity: number }) {
    const refusal = "A reservation pool requires a unique resource and capacity of at least 1.";
    if (!Number.isInteger(capacity) || capacity < 1) throw new InvalidPool(refusal);
    try {
      await this.pools.insertOne({ _id: resource, capacity, locked: false, reserved: [], waitlist: [] });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new InvalidPool(refusal);
      throw error;
    }
    return {};
  }

  /** Returns the user's new reservation. Raises PoolClosed when locked, AlreadyReserved when they hold a spot, and PoolFull when none is open. */
  async reserve({ resource, user }: { resource: string; user: string }) {
    const reservation = crypto.randomUUID();
    const filter: Filter<PoolDoc> = { _id: resource, locked: false, "reserved.user": { $ne: user }, ...hasRoom };
    const { matchedCount } = await this.pools.updateOne(filter, { $push: { reserved: { reservation, user } } });
    if (matchedCount) return { reservation };

    // nothing matched, so read the pool to say why
    const pool = await this.#pool(resource);
    if (pool.locked) throw new PoolClosed("Reservations are locked for this resource.");
    if (pool.reserved.some((r) => r.user === user)) throw new AlreadyReserved("You already hold a reservation for this resource.");
    throw new PoolFull("All spots are currently reserved; you may join the waitlist.");
  }

  /**
   * Adds the user to the end of a full pool's waitlist. Raises PoolClosed when locked, SpotsAvailable when
   * a spot is open, and AlreadyInPool when they already hold a spot or a waitlist place.
   */
  async joinWaitlist({ resource, user }: { resource: string; user: string }) {
    const filter: Filter<PoolDoc> = { _id: resource, locked: false, "reserved.user": { $ne: user }, waitlist: { $ne: user }, ...isFull };
    const { matchedCount } = await this.pools.updateOne(filter, { $push: { waitlist: user } });
    if (matchedCount) return {};

    const pool = await this.#pool(resource);
    if (pool.locked) throw new PoolClosed("The waitlist is locked for this resource.");
    if (pool.reserved.length < pool.capacity) throw new SpotsAvailable("Spots are still open; reserve directly.");
    throw new AlreadyInPool("You already hold a reservation or waitlist spot.");
  }

  /**
   * Gives the user a spot if one is open and a waitlist place otherwise, decided inside one update, so
   * someone accepting an invitation always ends up with one of the two however the pool changes around them.
   * Returns the new reservation, or the user's 1-based waitlist position.
   * Raises PoolClosed when locked, and AlreadyInPool when they already hold a spot or a waitlist place.
   */
  async claim({ resource, user }: { resource: string; user: string }): Promise<{ reservation?: string; position?: number }> {
    const reservation = crypto.randomUUID();
    // both fields are computed from the pool as it was before the update. $literal keeps a caller's id from being read as a field path.
    const before = await this.pools.findOneAndUpdate({ _id: resource, locked: false, "reserved.user": { $ne: user }, waitlist: { $ne: user } }, [
      {
        $set: {
          reserved: { $cond: [hasRoom.$expr, { $concatArrays: ["$reserved", [{ reservation, user: { $literal: user } }]] }, "$reserved"] },
          waitlist: { $cond: [hasRoom.$expr, "$waitlist", { $concatArrays: ["$waitlist", [{ $literal: user }]] }] },
        },
      },
    ]);
    if (before) return before.reserved.length < before.capacity ? { reservation } : { position: before.waitlist.length + 1 };

    const pool = await this.#pool(resource);
    if (pool.locked) throw new PoolClosed("Reservations are locked for this resource.");
    throw new AlreadyInPool("You already hold a reservation or waitlist spot.");
  }

  /**
   * Removes the reservation and, in the same update, gives the spot to the first user on the waitlist.
   * Returns the reservation's resource and user, and the promoted user when there was one. Doing both at once
   * means a freed spot is never open while someone is waiting, so nobody can reserve it ahead of them.
   * Raises NoSuchReservation, or CannotCancel once the pool is locked.
   */
  async cancel({ reservation }: { reservation: string }) {
    // an update pipeline, since the promoted user is read from the same document's waitlist.
    // $literal keeps a caller's id from being read as a field path.
    // ponytail: finds the pool by scanning for the reservation id, add an index on reserved.reservation if pools grow
    const before = await this.pools.findOneAndUpdate({ "reserved.reservation": reservation, locked: false }, [
      {
        $set: {
          reserved: {
            $concatArrays: [
              { $filter: { input: "$reserved", cond: { $ne: ["$$this.reservation", { $literal: reservation }] } } },
              { $cond: [{ $gt: [{ $size: "$waitlist" }, 0] }, [{ reservation: crypto.randomUUID(), user: { $first: "$waitlist" } }], []] },
            ],
          },
          // $slice needs a positive count, even for an empty waitlist
          waitlist: { $slice: ["$waitlist", 1, { $max: [{ $size: "$waitlist" }, 1] }] },
        },
      },
    ]);
    if (before) {
      const { user } = before.reserved.find((r) => r.reservation === reservation)!;
      return { resource: before._id, user, promoted: before.waitlist.at(0) };
    }

    if (!(await this.pools.findOne({ "reserved.reservation": reservation }))) throw new NoSuchReservation("Reservation not found.");
    throw new CannotCancel("Reservations are locked and can no longer be cancelled.");
  }

  /** Takes the user off the waitlist. The spec has no refusal here, so a user who is not waitlisted is a plain error. */
  async leaveWaitlist({ resource, user }: { resource: string; user: string }) {
    const { matchedCount } = await this.pools.updateOne({ _id: resource, waitlist: user }, { $pull: { waitlist: user } });
    if (!matchedCount) throw new Error(`${user} is not on the waitlist for ${resource}`);
    return {};
  }

  /**
   * Freezes the pool. Locking a pool that is already locked changes nothing, as the cutoff and
   * cleanup reactions both lock the same pool. A missing pool is a plain error.
   */
  async lock({ resource }: { resource: string }) {
    const { matchedCount } = await this.pools.updateOne({ _id: resource }, { $set: { locked: true } });
    if (!matchedCount) throw new Error(`no reservation pool for ${resource}`);
    return {};
  }

  /** Returns the pool's live counts in one row, or no rows when the resource has no pool. */
  async _getAvailability({ resource }: { resource: string }) {
    const pool = await this.pools.findOne({ _id: resource });
    if (!pool) return [];
    const reservedCount = pool.reserved.length;
    return [{ capacity: pool.capacity, reservedCount, remaining: pool.capacity - reservedCount, waitlistCount: pool.waitlist.length, locked: pool.locked }];
  }

  /** Returns whether the user holds a reservation for the resource. */
  async _hasReservation({ resource, user }: { resource: string; user: string }) {
    return { reserved: (await this.pools.countDocuments({ _id: resource, "reserved.user": user })) > 0 };
  }

  /** Returns the user's reservation for the resource in one row, or no rows when they have none. */
  async _getReservation({ resource, user }: { resource: string; user: string }) {
    const pool = await this.pools.findOne({ _id: resource });
    const found = pool?.reserved.find((r) => r.user === user);
    return found ? [{ reservation: found.reservation }] : [];
  }

  /** Returns the users holding a reservation for the resource, in the order they reserved. */
  async _getReservedUsers({ resource }: { resource: string }) {
    const pool = await this.pools.findOne({ _id: resource });
    return (pool?.reserved ?? []).map(({ user }) => ({ user }));
  }

  /** Returns the user's 1-based place on the waitlist in one row, or no rows when they are not on it. */
  async _getWaitlistPosition({ resource, user }: { resource: string; user: string }) {
    const pool = await this.pools.findOne({ _id: resource });
    const index = pool?.waitlist.indexOf(user) ?? -1;
    return index < 0 ? [] : [{ position: index + 1 }];
  }
}
