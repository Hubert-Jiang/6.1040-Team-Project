export interface EventListenerTarget<EventName extends string = string> {
  addEventListener(type: EventName, listener: () => void): void;
  removeEventListener(type: EventName, listener: () => void): void;
}

export interface VisibilityDocumentTarget extends EventListenerTarget<"visibilitychange"> {
  readonly visibilityState?: string;
}

export interface LiveRefresherOptions {
  /** Callback executed when a refresh runs. Errors are caught to keep future polls alive. */
  refresh: () => Promise<void> | void;
  /** Polling interval in milliseconds. Defaults to 2500 ms. */
  intervalMs?: number;
  /** Optional predicate; when true, scheduled and event-driven refreshes are skipped. */
  isPaused?: () => boolean;
  /** Optional visibility override; defaults to checking `documentTarget.visibilityState === "hidden"`. */
  isHidden?: () => boolean;
  /** Optional window-like target for `focus` and `pagehide` events. Defaults to global `window` when available. */
  windowTarget?: EventListenerTarget<"focus" | "pagehide"> | null;
  /** Optional document-like target for `visibilitychange` events. Defaults to global `document` when available. */
  documentTarget?: VisibilityDocumentTarget | null;
  /** Optional timer scheduler override for testing. */
  setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  /** Optional timer cleanup override for testing. */
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
}

export interface LiveRefresher {
  start(): void;
  stop(): void;
  trigger(): Promise<void>;
}

/**
 * Creates a single-flight polling and focus/visibility refresher.
 */
export function createLiveRefresher(options: LiveRefresherOptions): LiveRefresher {
  const intervalMs = options.intervalMs ?? 2500;
  const windowTarget =
    options.windowTarget !== undefined ? options.windowTarget : typeof window !== "undefined" ? window : null;
  const documentTarget =
    options.documentTarget !== undefined ? options.documentTarget : typeof document !== "undefined" ? document : null;
  const setIntervalFn = options.setIntervalFn ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearIntervalFn = options.clearIntervalFn ?? ((id) => globalThis.clearInterval(id));

  const isHidden = options.isHidden ?? (() => documentTarget?.visibilityState === "hidden");

  let active = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<void> | null = null;

  function trigger(): Promise<void> {
    if (!active || isHidden() || options.isPaused?.()) {
      return Promise.resolve();
    }
    if (inFlight) {
      return inFlight;
    }
    const run = (async () => {
      try {
        await options.refresh();
      } catch {
        // Ignore transient errors so future polls and focus refreshes continue.
      } finally {
        inFlight = null;
      }
    })();
    inFlight = run;
    return run;
  }

  const onFocus = () => {
    void trigger();
  };

  const onPageHide = () => {
    stop();
  };

  const onVisibilityChange = () => {
    if (!isHidden()) {
      void trigger();
    }
  };

  function start(): void {
    if (active) return;
    active = true;
    timerId = setIntervalFn(() => {
      void trigger();
    }, intervalMs);
    windowTarget?.addEventListener("focus", onFocus);
    windowTarget?.addEventListener("pagehide", onPageHide);
    documentTarget?.addEventListener("visibilitychange", onVisibilityChange);
  }

  function stop(): void {
    if (!active) return;
    active = false;
    if (timerId !== null) {
      clearIntervalFn(timerId);
      timerId = null;
    }
    windowTarget?.removeEventListener("focus", onFocus);
    windowTarget?.removeEventListener("pagehide", onPageHide);
    documentTarget?.removeEventListener("visibilitychange", onVisibilityChange);
  }

  return { start, stop, trigger };
}
