// The values the interface asks for repeatedly, held server-side and kept
// current by one refresher per kind (plan-docker_management_app-refresh_cache/REQ-9
// to REQ-17). Generic: no Docker vocabulary, no HTTP, no persistence.
import { onActiveEndpointChanged } from "../docker/endpoint.js";
import { eventStreamService, type DaemonEvent } from "../events/event-stream-service.js";

/** At most one read is started per kind per window, however many events arrive. */
export const EVENT_GROUPING_WINDOW_MS = 750;
/** Longer than the longest interval a client polls at (15 s), so a slow kind never expires between two of its own requests. */
export const DEMAND_EXPIRY_MS = 60000;
/** How many times a caller whose read was disowned by a discard reads again before giving up. */
const DISOWNED_READ_ATTEMPTS = 3;

export interface HeldValue<T> {
  value: T;
  /** When the value was read (epoch ms). */
  readAt: number;
  /** How old it is, at the moment it was asked for. */
  ageMs: number;
  /** True when the last read attempt failed and this is the value read before it. */
  stale: boolean;
  /** The message of that failed attempt. */
  error?: string;
}

/** What a manual reload did, kind by kind. */
export interface ReloadReport {
  /** Keys read again from the daemon. */
  reloaded: string[];
  /** Keys holding nothing, so not read. */
  skipped: string[];
  /** Keys whose read failed; each keeps the value it held. */
  failed: { key: string; error: string }[];
}

export interface RefreshKindOptions<T> {
  key: string;
  read: () => Promise<T>;
  periodMs: number;
  /** Daemon event types that mark this kind due; none by default. */
  eventTypes?: readonly string[];
  demandExpiryMs?: number;
  groupingWindowMs?: number;
}

export interface RefreshKind<T> {
  readonly key: string;
  read(): Promise<HeldValue<T>>;
  markChanged(): void;
  peek(): HeldValue<T> | undefined;
  isRefreshing(): boolean;
  dispose(): void;
}

/** What the registry needs of a kind, whatever its value type. */
interface RegisteredKind {
  readonly key: string;
  markDue(): void;
  discard(): void;
  reset(): void;
  reloadHeld(): Promise<KindReloadOutcome>;
}

/** What one kind did during a manual reload. */
export type KindReloadOutcome =
  | { status: "reloaded" }
  /** Nothing is held, so there is nothing to read again. */
  | { status: "skipped" }
  | { status: "failed"; error: string };

interface Held<T> {
  value: T;
  readAt: number;
  /** When the read that produced it started — what decides whether it covers a change. */
  startedAt: number;
}

class Kind<T> implements RefreshKind<T>, RegisteredKind {
  readonly key: string;
  private readonly readValue: () => Promise<T>;
  private readonly periodMs: number;
  private readonly demandExpiryMs: number;
  private readonly groupingWindowMs: number;

  private held?: Held<T>;
  private stale = false;
  private failure?: unknown;
  private inFlight?: Promise<void>;
  private periodTimer?: ReturnType<typeof setTimeout>;
  private groupingTimer?: ReturnType<typeof setTimeout>;
  private lastAskedAt = 0;
  private lastReadStartedAt = 0;
  private changedAt = 0;
  private dueAgain = false;
  /** Bumped by a discard, so a read still in flight against the previous daemon stores nothing. */
  private generation = 0;

  constructor(options: RefreshKindOptions<T>) {
    this.key = options.key;
    this.readValue = options.read;
    this.periodMs = options.periodMs;
    this.demandExpiryMs = options.demandExpiryMs ?? DEMAND_EXPIRY_MS;
    this.groupingWindowMs = options.groupingWindowMs ?? EVENT_GROUPING_WINDOW_MS;
  }

  /**
   * A discard — the active endpoint changed — drops what is held and disowns
   * the read in flight, which then stores neither a value nor a failure. The
   * caller waiting on that read reads again, against the endpoint now active,
   * so it is answered with a value or with the daemon's own failure and never
   * with neither (REQ-27). The bound stops a chain of discards from holding a
   * request.
   */
  async read(): Promise<HeldValue<T>> {
    this.lastAskedAt = Date.now();
    this.startRefresher();

    for (let attempt = 0; attempt < DISOWNED_READ_ATTEMPTS; attempt += 1) {
      const generation = this.generation;
      if (this.held) await this.awaitChangeCoverage();
      else await (this.inFlight ?? this.refresh());
      if (this.held) return this.snapshot();
      if (this.failure) break;
      // Nothing held, nothing to report and no discard: reading again would
      // only repeat what just happened.
      if (this.generation === generation) break;
    }
    throw this.failure ?? new Error(`The value "${this.key}" could not be read.`);
  }

  markChanged(): void {
    this.changedAt = Date.now();
    // Nobody is asking: the refresher is stopped and nothing is held, so the
    // next request reads fresh anyway and a call here would be one nobody wants.
    if (!this.periodTimer) return;
    if (this.inFlight) return; // the running read is followed by another, below
    this.clearGroupingTimer();
    void this.refresh();
  }

  peek(): HeldValue<T> | undefined {
    return this.held ? this.snapshot() : undefined;
  }

  isRefreshing(): boolean {
    return this.periodTimer !== undefined;
  }

  dispose(): void {
    this.reset();
    unregisterKind(this);
  }

  /**
   * Reads again now, on the operator's request. Only a kind that holds a value
   * is read (REQ-8), and the schedule is left exactly as it was: no period is
   * restarted, no refresher is started for a kind nobody asks for, and no
   * demand is renewed (REQ-10). A failure keeps the held value and is reported
   * rather than thrown (REQ-9).
   */
  async reloadHeld(): Promise<KindReloadOutcome> {
    if (!this.held) return { status: "skipped" };
    const requestedAt = Date.now();
    await this.refresh();
    // The read just awaited may be one that started before the request: it
    // cannot answer for the daemon's state now, so one more does.
    if (this.lastReadStartedAt < requestedAt) await this.refresh();
    if (this.stale) return { status: "failed", error: errorMessage(this.failure) };
    return { status: "reloaded" };
  }

  /** An event says this kind may have changed: read again, within the grouping window. */
  markDue(): void {
    if (!this.periodTimer) return;
    if (this.groupingTimer) return;
    if (this.inFlight) {
      this.dueAgain = true;
      return;
    }
    const sinceLastRead = Date.now() - this.lastReadStartedAt;
    if (sinceLastRead >= this.groupingWindowMs) {
      void this.refresh();
      return;
    }
    this.groupingTimer = setTimeout(() => {
      this.groupingTimer = undefined;
      void this.refresh();
    }, this.groupingWindowMs - sinceLastRead);
    this.groupingTimer.unref?.();
  }

  /** Back to the state of a kind just registered: nothing held, nothing running, nobody asking. */
  reset(): void {
    this.stopRefresher();
    this.discard();
    this.lastAskedAt = 0;
    this.lastReadStartedAt = 0;
  }

  /** Drops what is held and disowns any read in flight; the demand and the refresher stay. */
  discard(): void {
    this.generation += 1;
    this.held = undefined;
    this.stale = false;
    this.failure = undefined;
    this.changedAt = 0;
    this.dueAgain = false;
    this.clearGroupingTimer();
  }

  private snapshot(): HeldValue<T> {
    const held = this.held as Held<T>;
    return {
      value: held.value,
      readAt: held.readAt,
      ageMs: Math.max(0, Date.now() - held.readAt),
      stale: this.stale,
      error: this.stale ? errorMessage(this.failure) : undefined,
    };
  }

  /**
   * Waits for the read that covers a change the application itself made, when
   * the held value predates it (REQ-13). It never starts one: `markChanged`
   * already did. The bound stops a pathological chain from holding a request.
   */
  private async awaitChangeCoverage(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!this.held || this.changedAt <= this.held.startedAt) return;
      const inFlight = this.inFlight;
      if (!inFlight) return;
      await inFlight;
    }
  }

  /**
   * Reads once. The promise handed to callers is settled only after the
   * bookkeeping — including the follow-up read, when one is owed — so a caller
   * waiting on it never resumes between two reads and sees a value it should
   * not.
   */
  private refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const startedAt = Date.now();
    this.lastReadStartedAt = startedAt;
    const generation = this.generation;
    let settle!: () => void;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.inFlight = gate;
    void (async () => {
      try {
        const value = await this.readValue();
        if (generation !== this.generation) return;
        this.held = { value, readAt: Date.now(), startedAt };
        this.stale = false;
        this.failure = undefined;
      } catch (error) {
        if (generation !== this.generation) return;
        // The previous value stays: an unreachable daemon must not blank a list
        // (REQ-15).
        this.failure = error;
        this.stale = true;
      } finally {
        if (this.inFlight === gate) this.inFlight = undefined;
        if (generation === this.generation) this.afterRead(startedAt);
        settle();
      }
    })();
    return gate;
  }

  /** Chains the follow-up read when the one that just ended cannot have seen what it had to see. */
  private afterRead(startedAt: number): void {
    // A failed read is never chased: the failure would repeat, and the held
    // value already answers.
    if (this.stale) {
      this.dueAgain = false;
      return;
    }
    if (this.changedAt > startedAt) {
      void this.refresh();
      return;
    }
    if (this.dueAgain) {
      this.dueAgain = false;
      this.markDue();
    }
  }

  private startRefresher(): void {
    if (this.periodTimer) return;
    this.periodTimer = setTimeout(() => this.tick(), this.periodMs);
    this.periodTimer.unref?.();
  }

  private tick(): void {
    this.periodTimer = undefined;
    if (Date.now() - this.lastAskedAt > this.demandExpiryMs) {
      // Nobody has asked for a whole expiry window: stop reading and drop what
      // is held, so the next request reads fresh instead of serving a value of
      // unknown age (REQ-14).
      this.stopRefresher();
      this.discard();
      return;
    }
    void this.refresh();
    this.startRefresher();
  }

  private stopRefresher(): void {
    if (this.periodTimer) clearTimeout(this.periodTimer);
    this.periodTimer = undefined;
    this.clearGroupingTimer();
  }

  private clearGroupingTimer(): void {
    if (this.groupingTimer) clearTimeout(this.groupingTimer);
    this.groupingTimer = undefined;
  }
}

const kinds = new Map<string, RegisteredKind>();
const kindsByEventType = new Map<string, Set<RegisteredKind>>();
let wired = false;

export function registerRefreshKind<T>(options: RefreshKindOptions<T>): RefreshKind<T> {
  if (kinds.has(options.key)) throw new Error(`A refresh kind named "${options.key}" is already registered.`);
  wireOnce();
  const kind = new Kind<T>(options);
  kinds.set(options.key, kind);
  for (const type of options.eventTypes ?? []) {
    const listeners = kindsByEventType.get(type) ?? new Set<RegisteredKind>();
    listeners.add(kind);
    kindsByEventType.set(type, listeners);
  }
  return kind;
}

/**
 * Drops every held value: another context is another daemon, and nothing read
 * from the one left behind may reach the interface (REQ-16).
 */
export function discardHeldValues(): void {
  kinds.forEach((kind) => kind.discard());
}

/**
 * Puts every kind back to the state it had when it was registered: nothing
 * held, no refresher running, no demand. The seam a check uses between two
 * cases, so neither inherits what the other read.
 */
export function resetRefreshCache(): void {
  kinds.forEach((kind) => kind.reset());
}

/**
 * Reads again, at once, every value currently held — whatever kind it is — and
 * ends only when all those reads have ended (REQ-7). A kind holding nothing is
 * skipped rather than read (REQ-8); a kind whose read fails keeps what it held
 * and is reported (REQ-9). Nothing else about the cache moves (REQ-10).
 */
export async function reloadHeldValues(): Promise<ReloadReport> {
  const entries = [...kinds.values()];
  const outcomes = await Promise.all(entries.map((kind) => kind.reloadHeld()));
  const report: ReloadReport = { reloaded: [], skipped: [], failed: [] };
  entries.forEach((kind, index) => {
    const outcome = outcomes[index] as KindReloadOutcome;
    if (outcome.status === "reloaded") report.reloaded.push(kind.key);
    else if (outcome.status === "skipped") report.skipped.push(kind.key);
    else report.failed.push({ key: kind.key, error: outcome.error });
  });
  return report;
}

function unregisterKind(kind: RegisteredKind): void {
  kinds.delete(kind.key);
  kindsByEventType.forEach((set) => set.delete(kind));
}

/**
 * One listener on the republished daemon stream however many kinds exist, and
 * one on the active-endpoint change. Wired on the first registration so a
 * process that registers nothing subscribes to nothing.
 */
function wireOnce(): void {
  if (wired) return;
  wired = true;
  eventStreamService.on("event", (event: DaemonEvent) => {
    kindsByEventType.get(event.type)?.forEach((kind) => kind.markDue());
  });
  onActiveEndpointChanged(() => discardHeldValues());
}

function errorMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}
