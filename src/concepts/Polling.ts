import { type Collection, type Db, MongoServerError } from "mongodb";

export class InvalidOption extends Error {}
export class DuplicateOption extends Error {}
export class OptionLimitReached extends Error {}
export class NoSuchOption extends Error {}

interface OptionDoc {
  _id: string;
  scope: string;
  label: string;
  normalizedLabel: string;
  proposedBy: string;
  createdAt: Date;
}

interface VoteDoc {
  _id: string;
  scope: string;
  option: string;
  voter: string;
}

const MAX_LABEL_LENGTH = 100;
const MAX_OPTIONS_PER_SCOPE = 20;

/** Scoped participant-nominated options with single-choice switchable voting. */
export class PollingConcept {
  private readonly options: Collection<OptionDoc>;
  private readonly votes: Collection<VoteDoc>;
  private indexes: Promise<unknown> | undefined;

  constructor(database: Db, name = "Polling") {
    const prefix = name.toLowerCase();
    this.options = database.collection(`${prefix}.options`);
    this.votes = database.collection(`${prefix}.votes`);
  }

  #ready() {
    this.indexes ??= Promise.all([
      this.options.createIndex({ scope: 1, normalizedLabel: 1 }, { unique: true }),
      this.options.createIndex({ scope: 1, createdAt: 1, _id: 1 }),
      this.votes.createIndex({ scope: 1, voter: 1 }, { unique: true }),
      this.votes.createIndex({ scope: 1, option: 1 }),
    ]).catch((error: unknown) => {
      this.indexes = undefined;
      throw error;
    });
    return this.indexes;
  }

  /**
   * Proposes a new option in `scope` and returns its id. Raises InvalidOption when trimmed label is empty or
   * over 100 characters, DuplicateOption when a case-insensitive match already exists in `scope`, and
   * OptionLimitReached when `scope` already has 20 options.
   */
  async addOption(input: { scope: string; label: string; proposedBy: string; now: Date }) {
    const { scope, proposedBy, now } = input;
    const label = input.label.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) {
      throw new InvalidOption("Poll option label must be between 1 and 100 non-whitespace characters.");
    }

    const normalizedLabel = label.toLowerCase();
    await this.#ready();

    if (await this.options.findOne({ scope, normalizedLabel })) {
      throw new DuplicateOption("An option with that name already exists in this poll.");
    }

    if ((await this.options.countDocuments({ scope })) >= MAX_OPTIONS_PER_SCOPE) {
      throw new OptionLimitReached("A poll can have at most 20 options.");
    }

    const doc: OptionDoc = {
      _id: crypto.randomUUID(),
      scope,
      label,
      normalizedLabel,
      proposedBy,
      createdAt: now,
    };

    try {
      await this.options.insertOne(doc);
      return { option: doc._id };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new DuplicateOption("An option with that name already exists in this poll.");
      }
      throw error;
    }
  }

  /**
   * Sets `voter`'s single vote in `scope` to `option`, replacing any previous vote in `scope`.
   * Raises NoSuchOption when `option` does not exist in `scope`.
   */
  async castVote({ scope, option, voter }: { scope: string; option: string; voter: string }) {
    await this.#ready();
    if (!(await this.options.findOne({ _id: option, scope }))) {
      throw new NoSuchOption("Poll option not found in this scope.");
    }

    const filter = { scope, voter };
    const update = { $set: { option }, $setOnInsert: { _id: crypto.randomUUID(), scope, voter } };
    try {
      await this.votes.updateOne(filter, update, { upsert: true });
    } catch (error) {
      // A concurrent first vote for (scope, voter) can hit the unique index; retrying updates that new row.
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      await this.votes.updateOne(filter, update, { upsert: true });
    }
    return {};
  }

  /** Removes `voter`'s vote in `scope` if present. */
  async clearVote({ scope, voter }: { scope: string; voter: string }) {
    await this.#ready();
    await this.votes.deleteOne({ scope, voter });
    return {};
  }

  /**
   * Removes `option` from `scope` along with all votes referencing it in `scope`.
   * Raises NoSuchOption when `option` does not exist in `scope`.
   */
  async removeOption({ scope, option }: { scope: string; option: string }) {
    await this.#ready();
    const { deletedCount } = await this.options.deleteOne({ _id: option, scope });
    if (deletedCount !== 1) {
      throw new NoSuchOption("Poll option not found in this scope.");
    }
    await this.votes.deleteMany({ scope, option });
    return {};
  }

  /** Returns every option in `scope`, ordered by createdAt ascending then option identity. */
  async _listOptions({ scope }: { scope: string }) {
    await this.#ready();
    const rows = await this.options.find({ scope }).sort({ createdAt: 1, _id: 1 }).toArray();
    return rows.map(({ _id, label, proposedBy, createdAt }) => ({
      option: _id,
      label,
      proposedBy,
      createdAt,
    }));
  }

  /** Returns scope, label, and proposedBy for `option` in one row, or no rows if absent. */
  async _getOption({ option }: { option: string }) {
    await this.#ready();
    const found = await this.options.findOne({ _id: option });
    return found ? [{ scope: found.scope, label: found.label, proposedBy: found.proposedBy }] : [];
  }

  /** Returns the integer count of votes referencing `option`, or 0 if none or absent. */
  async _getVoteCount({ option }: { option: string }) {
    await this.#ready();
    const voteCount = await this.votes.countDocuments({ option });
    return { voteCount };
  }

  /** Returns the voted option for `(scope, voter)` in one row, or no rows if `voter` has not voted in `scope`. */
  async _getVote({ scope, voter }: { scope: string; voter: string }) {
    await this.#ready();
    const found = await this.votes.findOne({ scope, voter });
    return found ? [{ option: found.option }] : [];
  }
}
