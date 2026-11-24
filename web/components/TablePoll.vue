<script lang="ts">
export const POLL_MAX_OPTIONS = 20;
export const POLL_MAX_LABEL_LENGTH = 100;

export interface PollOptionItem {
  option: string;
  label: string;
  voteCount: number;
  canRemove: boolean;
}

export interface TablePollData {
  open: boolean;
  confirmedVenue?: string | null;
  hosting: boolean;
  votedOption: string | null;
  options: readonly PollOptionItem[];
}

export type PollActionKind = "add" | "vote" | "unvote" | "remove" | "chooseVenue";

export const POLL_ERROR_MESSAGES: Record<string, string> = {
  INVALID_OPTION: "Enter a location name up to 100 characters.",
  INVALID_DETAILS: "Enter a location name up to 100 characters.",
  DUPLICATE_OPTION: "That location is already in the poll.",
  OPTION_LIMIT_REACHED: "This poll already has the maximum of 20 options.",
  POLL_CLOSED: "Voting closed because the table's venue is already set.",
  CANNOT_SET_VENUE: "Voting closed because the table's venue is already set.",
  TABLE_INACTIVE: "This table is no longer active.",
  NOT_PARTICIPANT: "Only the host and seated guests can participate in the poll.",
  NOT_AUTHORIZED: "Only the host or the person who suggested this option can remove it.",
  NO_SUCH_OPTION: "That location option is no longer in the poll.",
  NO_SUCH_TABLE: "Could not find this table.",
  NETWORK_ERROR: "Could not reach the server. Please try again.",
  TIMEOUT: "The request timed out. Please try again.",
  ABORTED: "The request was cancelled.",
  INVALID_RESPONSE: "Received an unexpected response from the server.",
};

export function checkAddPollOption(poll: TablePollData | null, rawLabel: string): { trimmed: string; error?: string } {
  const trimmed = rawLabel.trim();
  if (!trimmed || trimmed.length > POLL_MAX_LABEL_LENGTH) {
    return { trimmed, error: POLL_ERROR_MESSAGES.INVALID_OPTION };
  }
  if (poll && !poll.open) {
    return { trimmed, error: POLL_ERROR_MESSAGES.POLL_CLOSED };
  }
  if (poll && poll.options.some((opt) => opt.label.trim().toLowerCase() === trimmed.toLowerCase())) {
    return { trimmed, error: POLL_ERROR_MESSAGES.DUPLICATE_OPTION };
  }
  if (poll && poll.options.length >= POLL_MAX_OPTIONS) {
    return { trimmed, error: POLL_ERROR_MESSAGES.OPTION_LIMIT_REACHED };
  }
  return { trimmed };
}

export function resolvePollActionError(
  action: PollActionKind,
  errorCode: string,
  context: { poll?: TablePollData | null; tableActive?: boolean; attemptedLabel?: string } = {},
): string {
  if (errorCode === "INVALID_REQUEST") {
    return action === "add" ? POLL_ERROR_MESSAGES.INVALID_OPTION : "Could not update the location poll. Please try again.";
  }
  if (errorCode === "CONFLICT") {
    if (context.tableActive === false) return POLL_ERROR_MESSAGES.TABLE_INACTIVE;
    if (context.poll && !context.poll.open) return POLL_ERROR_MESSAGES.POLL_CLOSED;
    if (action === "add") {
      const label = context.attemptedLabel?.trim().toLowerCase();
      if (label && context.poll?.options.some((opt) => opt.label.trim().toLowerCase() === label)) {
        return POLL_ERROR_MESSAGES.DUPLICATE_OPTION;
      }
      if (context.poll && context.poll.options.length >= POLL_MAX_OPTIONS) {
        return POLL_ERROR_MESSAGES.OPTION_LIMIT_REACHED;
      }
      return "Could not add that location right now.";
    }
    if (action === "chooseVenue") return POLL_ERROR_MESSAGES.CANNOT_SET_VENUE;
    return POLL_ERROR_MESSAGES.POLL_CLOSED;
  }
  if (errorCode === "FORBIDDEN") {
    return action === "remove" ? POLL_ERROR_MESSAGES.NOT_AUTHORIZED : POLL_ERROR_MESSAGES.NOT_PARTICIPANT;
  }
  if (errorCode === "NOT_FOUND") {
    return action === "chooseVenue" || action === "vote" || action === "remove"
      ? POLL_ERROR_MESSAGES.NO_SUCH_OPTION
      : POLL_ERROR_MESSAGES.NO_SUCH_TABLE;
  }
  return POLL_ERROR_MESSAGES[errorCode] ?? "Could not update the location poll. Please try again.";
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
  poll: TablePollData | null;
  loading?: boolean;
  busy?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  add: [label: string];
  vote: [option: string];
  unvote: [];
  remove: [option: string];
  chooseVenue: [option: string];
}>();

const newLabel = ref("");
const pendingAdd = ref(false);

const showErrorOnly = computed(() => !props.poll && Boolean(props.error));
const showClosedSummary = computed(() => Boolean(props.poll && !props.poll.open && props.poll.options.length > 0));
const showOpenPoll = computed(() => Boolean(props.poll && props.poll.open));

function formatVotes(count: number): string {
  return count === 1 ? "1 vote" : `${count} votes`;
}

function toggleVote(option: string) {
  if (props.busy || !props.poll) return;
  if (props.poll.votedOption === option) {
    emit("unvote");
  } else {
    emit("vote", option);
  }
}

function submitAdd() {
  if (props.busy) return;
  pendingAdd.value = true;
  emit("add", newLabel.value);
  queueMicrotask(() => {
    if (!props.busy && props.error) {
      pendingAdd.value = false;
    }
  });
}

watch(
  () => [props.busy, props.error, props.poll?.options.length] as const,
  ([busy, error, count], [prevBusy, , prevCount]) => {
    if (!pendingAdd.value) return;
    if (typeof count === "number" && typeof prevCount === "number" && count > prevCount) {
      newLabel.value = "";
      pendingAdd.value = false;
      return;
    }
    if (prevBusy && !busy) {
      if (!error) {
        newLabel.value = "";
      }
      pendingAdd.value = false;
      return;
    }
    if (!busy && error) {
      pendingAdd.value = false;
    }
  },
);
</script>

<template>
  <section v-if="showErrorOnly" class="card stack">
    <p class="error" role="alert">{{ error }}</p>
  </section>

  <details v-else-if="showClosedSummary && poll" class="card poll-summary">
    <summary class="poll-summary-toggle">
      {{ poll.confirmedVenue ? `Location poll · Venue set: ${poll.confirmedVenue}` : "Location poll closed" }}
    </summary>
    <div class="stack poll-summary-body">
      <ul class="roster-list">
        <li v-for="opt in poll.options" :key="opt.option" class="roster-item">
          <div class="poll-option-main">
            <span class="poll-option-label"><strong>{{ opt.label }}</strong></span>
            <span class="badge">{{ formatVotes(opt.voteCount) }}</span>
          </div>
        </li>
      </ul>
      <p v-if="error" class="error small" role="alert">{{ error }}</p>
    </div>
  </details>

  <section v-else-if="showOpenPoll && poll" class="card stack">
    <div>
      <strong>Location poll</strong>
      <div class="muted small">
        {{ poll.options.length > 0 ? "Vote on where to go" : "No locations yet — suggest a spot below." }}
      </div>
    </div>

    <ul v-if="poll.options.length > 0" class="roster-list">
      <li v-for="opt in poll.options" :key="opt.option" class="roster-item poll-option">
        <div class="poll-option-main">
          <span class="poll-option-label"><strong>{{ opt.label }}</strong></span>
          <span class="poll-option-controls">
            <span class="badge">{{ formatVotes(opt.voteCount) }}</span>
            <button
              type="button"
              :class="['poll-vote-btn', { selected: poll.votedOption === opt.option }]"
              :aria-pressed="poll.votedOption === opt.option"
              :disabled="busy"
              @click="toggleVote(opt.option)"
            >
              {{ poll.votedOption === opt.option ? "Voted" : "Vote" }}
            </button>
          </span>
        </div>
        <div v-if="poll.hosting || opt.canRemove" class="poll-option-actions">
          <button
            v-if="poll.hosting"
            type="button"
            class="link-btn small"
            :disabled="busy"
            @click="emit('chooseVenue', opt.option)"
          >
            Set as venue
          </button>
          <button
            v-if="opt.canRemove"
            type="button"
            class="link-btn danger small"
            :disabled="busy"
            @click="emit('remove', opt.option)"
          >
            Remove
          </button>
        </div>
      </li>
    </ul>

    <form class="row" @submit.prevent="submitAdd">
      <input
        v-model="newLabel"
        class="input"
        maxlength="100"
        :disabled="busy"
        placeholder="Suggest a spot (e.g. Flour Bakery)"
        aria-label="Suggest a dining location"
      />
      <button type="submit" class="btn btn-small" :disabled="busy">Add</button>
    </form>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>
  </section>
</template>
