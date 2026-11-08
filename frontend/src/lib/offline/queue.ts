// The offline confirmation queue (SCRUM-273): Picked up / Dropped off / Not present
// taps saved on the phone and sent once there is a connection, with no tap lost and
// none recorded twice. Framework-free: the driver screen binds it to React through
// subscribe/getSnapshot (useSyncExternalStore). The rules are the ones in
// docs/contracts/driver-gps-offline.md:
//
// - enqueue() gives each tap a clientRequestId and writes the item, key included, to
//   storage in that same synchronous call, before anything is sent. Every resend of
//   that item (automatic, after a reload, or the driver's Try again) reuses the key,
//   so the server can recognise it. Only a new tap gets a new key.
// - Items for one student on one run go out in the order they were tapped, one at a
//   time. While the first unsent one has failed, the ones behind it are "blocked".
// - Storage is re-read before every change (another tab may have written since), and
//   a tab holds the drain lock while sending, so two tabs never send one item at once.
// - With no replay API (confirmationReplayApi is null until SCRUM-263), items are kept
//   and nothing is sent.

import type { ConfirmationReplayApi } from "../api/confirmationReplay";
import type { ConfirmationStatus, Run } from "../api/runs";
import { classifyFailure, type Failure } from "./classify";
import { newId } from "./ids";
import type { DrainLock } from "./lock";
import { StorageError, type KeyValueStore } from "./storage";

export type QueueItemState = "queued" | "sending" | "synced" | "conflict" | "error" | "blocked";

export interface QueueItemError {
  // retryable: sent again automatically after a backoff (and on Try again).
  // rejected: the server refused the request itself; only Try again resends it.
  // conflict: the server disagrees with the screen (404/409), or the item is from an
  // earlier day; never sent again automatically.
  kind: "retryable" | "rejected" | "conflict";
  message: string;
}

export interface QueueItem {
  id: string;
  clientRequestId: string;
  runId: string;
  // The run's date ("YYYY-MM-DD", Asia/Beirut), to tell today's items from stale ones.
  runDate: string;
  studentId: string;
  status: ConfirmationStatus;
  // The moment of the tap, from the device's clock, for the screen to show. Not sent:
  // whether the server may use it is an open question in the contract.
  occurredAt: string;
  createdAt: number;
  attempts: number;
  state: QueueItemState;
  lastError?: QueueItemError;
  // The HTTP status of the last answer (200 once synced).
  serverStatus?: number;
  // When a retryable failure is next sent automatically (ms since the epoch).
  nextAttemptAt?: number;
  // When it was synced, for pruning it after a short display.
  syncedAt?: number;
}

export interface QueueSnapshot {
  // In the order they were tapped.
  items: readonly QueueItem[];
  // A 401: nothing is sent until resume() (after sign-in) or a new queue.
  paused: boolean;
  draining: boolean;
  // Storage that can't be read or written. Shown, never ignored: while it's set,
  // enqueue() refuses, so the screen can't claim a tap was saved when it wasn't.
  storageError: StorageError | null;
  // False while the replay API is null.
  replayAvailable: boolean;
}

export type QueueEvent =
  // Sent and recorded; run is the server's answer, for the screen to redraw the stop.
  | { type: "synced"; item: QueueItem; run: Run }
  // The day should be refetched: the server's view differs from the screen's.
  | { type: "conflict"; item: QueueItem }
  | { type: "auth" }
  // Whether the last attempt reached the server (any HTTP answer) or not, for Connectivity.
  | { type: "network"; reachable: boolean };

export type EnqueueResult =
  | { ok: true; item: QueueItem; duplicate: boolean }
  | { ok: false; error: StorageError };

export interface EnqueueInput {
  runId: string;
  runDate: string;
  studentId: string;
  status: ConfirmationStatus;
}

export interface OfflineQueueOptions {
  store: KeyValueStore;
  // queueStorageKey(userId).
  storageKey: string;
  api: ConfirmationReplayApi | null;
  lock: DrainLock;
  // Today's date, "YYYY-MM-DD" in Asia/Beirut (the server's "today", runs.md).
  today?: () => string;
  newId?: () => string;
  onEvent?: (event: QueueEvent) => void;
  sendTimeoutMs?: number;
  syncedDisplayMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  // How long to wait before trying again when another tab holds the lock.
  lockRetryMs?: number;
}

export const DEFAULT_SEND_TIMEOUT_MS = 15_000;
export const DEFAULT_SYNCED_DISPLAY_MS = 3_000;
export const DEFAULT_BACKOFF_BASE_MS = 2_000;
export const DEFAULT_BACKOFF_MAX_MS = 60_000;
export const DEFAULT_LOCK_RETRY_MS = 5_000;

export const STALE_MESSAGE = "This confirmation is from an earlier day and wasn't sent.";

const STATES: readonly QueueItemState[] = ["queued", "sending", "synced", "conflict", "error", "blocked"];
const STATUSES: readonly ConfirmationStatus[] = ["PICKED_UP", "DROPPED_OFF", "NOT_PRESENT"];

export function todayInBeirut(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// min(max, base * 2^(attempts - 1)): 2s, 4s, 8s ... capped at a minute by default.
export function backoffDelay(attempts: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
}

export class OfflineQueue {
  private readonly store: KeyValueStore;
  private readonly key: string;
  private readonly api: ConfirmationReplayApi | null;
  private readonly lock: DrainLock;
  private readonly today: () => string;
  private readonly makeId: () => string;
  private readonly onEvent?: (event: QueueEvent) => void;
  private readonly sendTimeoutMs: number;
  private readonly syncedDisplayMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly lockRetryMs: number;

  private snapshot: QueueSnapshot;
  private readonly listeners = new Set<() => void>();
  private draining: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lockBusyUntil = 0;
  private disposed = false;
  private readonly unsubscribeStore: () => void;

  constructor(options: OfflineQueueOptions) {
    this.store = options.store;
    this.key = options.storageKey;
    this.api = options.api;
    this.lock = options.lock;
    this.today = options.today ?? (() => todayInBeirut());
    this.makeId = options.newId ?? (() => newId());
    this.onEvent = options.onEvent;
    this.sendTimeoutMs = options.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.syncedDisplayMs = options.syncedDisplayMs ?? DEFAULT_SYNCED_DISPLAY_MS;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
    this.lockRetryMs = options.lockRetryMs ?? DEFAULT_LOCK_RETRY_MS;

    this.snapshot = {
      items: [],
      paused: false,
      draining: false,
      storageError: null,
      replayAvailable: this.api !== null,
    };
    this.refresh();
    // Another tab's write: show it (cross-tab UI sync). Nothing is written back.
    this.unsubscribeStore = this.store.subscribe((key) => {
      if (key === null || key === this.key) this.refresh();
    });
  }

  getSnapshot = (): QueueSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // Saves one tap. Synchronous: when this returns ok, the item and its
  // clientRequestId are in storage. It sends nothing; call drain() for that.
  enqueue(input: EnqueueInput): EnqueueResult {
    // A store that can't be read (corrupt) or written (full) refuses here, so the
    // screen never claims a tap was saved when it wasn't. Corrupt data is left as it
    // is, not overwritten.
    let saved: QueueItem | undefined;
    let duplicate = false;
    const ok = this.mutate((items) => {
      // A tap identical to one not yet sent changes nothing.
      const existing = items.find((item) => item.state !== "synced" && sameRequest(item, input));
      if (existing) {
        saved = existing;
        duplicate = true;
        return items;
      }
      const now = Date.now();
      saved = {
        id: this.makeId(),
        clientRequestId: this.makeId(),
        runId: input.runId,
        runDate: input.runDate,
        studentId: input.studentId,
        status: input.status,
        occurredAt: new Date(now).toISOString(),
        createdAt: now,
        attempts: 0,
        state: "queued",
      };
      return [...items, saved];
    });
    if (!ok || !saved) {
      return { ok: false, error: this.snapshot.storageError ?? unavailable() };
    }
    // Return it as stored (it may have come out blocked).
    return { ok: true, item: this.find(saved.id) ?? saved, duplicate };
  }

  // Sends every item that can go now, in order. Concurrent calls share one run, and a
  // tab that can't get the lock sends nothing (the tab holding it sends for both).
  drain(): Promise<void> {
    if (this.draining) return this.draining;
    if (this.disposed || !this.api || this.snapshot.paused) return Promise.resolve();
    const api = this.api;
    this.update({ draining: true });
    this.draining = this.runDrain(api).finally(() => {
      this.draining = null;
      this.update({ draining: false });
      this.schedule();
    });
    return this.draining;
  }

  // Try again on one item that failed (error or conflict). It keeps its
  // clientRequestId. Items from an earlier day can only be discarded.
  retry(id: string): boolean {
    const item = this.find(id);
    if (!item || (item.state !== "error" && item.state !== "conflict")) return false;
    if (item.runDate !== this.today()) return false;
    const ok = this.mutate((items) =>
      items.map((i) =>
        i.id === id
          ? { ...i, state: "queued", lastError: undefined, nextAttemptAt: undefined }
          : i,
      ),
    );
    if (ok) void this.drain();
    return ok;
  }

  // Removes one item that failed (error or conflict), on the driver's say-so.
  discard(id: string): boolean {
    const item = this.find(id);
    if (!item || (item.state !== "error" && item.state !== "conflict")) return false;
    const ok = this.mutate((items) => items.filter((i) => i.id !== id));
    if (ok) void this.drain();
    return ok;
  }

  // After a 401, once the driver has signed in again.
  resume(): Promise<void> {
    this.update({ paused: false });
    return this.drain();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.unsubscribeStore();
    this.listeners.clear();
  }

  private async runDrain(api: ConfirmationReplayApi): Promise<void> {
    const result = await this.lock.run(async (keepAlive) => {
      // We hold the lock, so an item still "sending" was left by a tab that closed or
      // reloaded mid-send. It goes again with the same key; the server dedups it.
      if (!this.mutate((items) => items.map((i) => (i.state === "sending" ? { ...i, state: "queued" } : i)))) {
        return;
      }
      while (!this.disposed && !this.snapshot.paused) {
        const next = pickNext(this.snapshot.items, Date.now());
        if (!next) return;
        keepAlive();
        const marked = this.mutate((items) =>
          items.map((i) =>
            i.id === next.id ? { ...i, state: "sending", attempts: i.attempts + 1 } : i,
          ),
        );
        if (!marked) return;
        if ((await this.send(api, this.find(next.id) ?? next)) === "stop") return;
      }
    });
    if (!result.acquired) this.lockBusyUntil = Date.now() + this.lockRetryMs;
  }

  private async send(api: ConfirmationReplayApi, item: QueueItem): Promise<"continue" | "stop"> {
    let run: Run;
    try {
      run = await api.confirm(
        {
          runId: item.runId,
          studentId: item.studentId,
          status: item.status,
          clientRequestId: item.clientRequestId,
        },
        { timeoutMs: this.sendTimeoutMs },
      );
    } catch (error) {
      const failure = classifyFailure(error);
      this.emit({ type: "network", reachable: !(failure.kind === "retryable" && failure.network) });
      return this.recordFailure(item, failure);
    }
    this.emit({ type: "network", reachable: true });
    const syncedAt = Date.now();
    this.change(item.id, {
      state: "synced",
      syncedAt,
      serverStatus: 200,
      lastError: undefined,
      nextAttemptAt: undefined,
    });
    this.emit({ type: "synced", item: this.find(item.id) ?? { ...item, state: "synced" }, run });
    return "continue";
  }

  private recordFailure(item: QueueItem, failure: Failure): "continue" | "stop" {
    switch (failure.kind) {
      case "auth":
        // Kept as it was before the attempt; sent once the driver is signed in again.
        this.change(item.id, { state: "queued", serverStatus: failure.status });
        this.update({ paused: true });
        this.emit({ type: "auth" });
        return "stop";
      case "conflict":
        this.change(item.id, {
          state: "conflict",
          serverStatus: failure.status,
          lastError: { kind: "conflict", message: failure.message },
          nextAttemptAt: undefined,
        });
        this.emit({ type: "conflict", item: this.find(item.id) ?? item });
        return "continue";
      case "rejected":
        this.change(item.id, {
          state: "error",
          serverStatus: failure.status,
          lastError: { kind: "rejected", message: failure.message },
          nextAttemptAt: undefined,
        });
        return "continue";
      case "retryable":
        this.change(item.id, {
          state: "error",
          serverStatus: failure.status,
          lastError: { kind: "retryable", message: failure.message },
          nextAttemptAt:
            Date.now() + backoffDelay(item.attempts, this.backoffBaseMs, this.backoffMaxMs),
        });
        // Most likely offline: stop here rather than fail every other item too.
        return "stop";
    }
  }

  private change(id: string, patch: Partial<QueueItem>): boolean {
    return this.mutate((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  // Read storage, apply the change, tidy (prune, stale, blocked), write. Nothing changes
  // in memory unless the write succeeded; a storage failure is kept in the snapshot.
  private mutate(change: (items: QueueItem[]) => QueueItem[]): boolean {
    let next: QueueItem[];
    try {
      next = this.tidy(change(this.load()));
      this.store.setItem(this.key, JSON.stringify({ v: 1, items: next }));
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      this.update({ storageError: error });
      return false;
    }
    this.update({ items: next, storageError: null });
    this.schedule();
    return true;
  }

  // Shows what storage holds, without writing.
  private refresh() {
    try {
      this.update({ items: this.tidy(this.load()), storageError: null });
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      this.update({ storageError: error });
    }
    this.schedule();
  }

  private load(): QueueItem[] {
    const raw = this.store.getItem(this.key);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw corrupt();
    }
    if (!isStoredQueue(parsed)) throw corrupt();
    return parsed.items;
  }

  private tidy(items: QueueItem[]): QueueItem[] {
    const now = Date.now();
    const today = this.today();
    const kept = items.filter(
      (i) => !(i.state === "synced" && (i.syncedAt ?? 0) + this.syncedDisplayMs <= now),
    );
    return blockBehindFailures(markStale(kept, today));
  }

  private find(id: string): QueueItem | undefined {
    return this.snapshot.items.find((i) => i.id === id);
  }

  // One timer for the next thing that's due: pruning a synced item, or retrying one.
  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed) return;
    const due: number[] = [];
    const canSend = this.api !== null && !this.snapshot.paused;
    for (const item of this.snapshot.items) {
      if (item.state === "synced" && item.syncedAt !== undefined) {
        due.push(item.syncedAt + this.syncedDisplayMs);
      }
      if (canSend && isAutoRetryable(item) && item.nextAttemptAt !== undefined) {
        due.push(Math.max(item.nextAttemptAt, this.lockBusyUntil));
      }
    }
    if (due.length === 0) return;
    const delay = Math.max(0, Math.min(...due) - Date.now());
    this.timer = setTimeout(() => this.onTimer(), delay);
  }

  private onTimer() {
    this.timer = undefined;
    const now = Date.now();
    const pruneDue = this.snapshot.items.some(
      (i) => i.state === "synced" && (i.syncedAt ?? 0) + this.syncedDisplayMs <= now,
    );
    if (pruneDue) this.mutate((items) => items);
    if (this.draining) return; // Its finally() reschedules.
    if (this.snapshot.items.some((i) => isAutoRetryable(i) && (i.nextAttemptAt ?? 0) <= now)) {
      void this.drain();
    }
  }

  private update(patch: Partial<QueueSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  private emit(event: QueueEvent) {
    try {
      this.onEvent?.(event);
    } catch (error) {
      // A handler's bug mustn't stop the queue; report it without swallowing it.
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

function sameRequest(item: QueueItem, input: EnqueueInput): boolean {
  return (
    item.runId === input.runId && item.studentId === input.studentId && item.status === input.status
  );
}

function groupOf(item: QueueItem): string {
  return `${item.runId}/${item.studentId}`;
}

function isAutoRetryable(item: QueueItem): boolean {
  return item.state === "error" && item.lastError?.kind === "retryable";
}

// The next item to send: the first unsent item of its (run, student), either never
// tried or a retryable failure whose backoff is over.
function pickNext(items: readonly QueueItem[], now: number): QueueItem | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.state === "synced") continue;
    const group = groupOf(item);
    if (seen.has(group)) continue;
    seen.add(group);
    if (item.state === "queued") return item;
    if (isAutoRetryable(item) && (item.nextAttemptAt ?? 0) <= now) return item;
  }
  return undefined;
}

// An unsent item for another day is never sent automatically: the server would answer
// 404 (runs.md), so it's shown as a conflict for the driver to dismiss. "sending" is
// left alone: only the lock holder changes it.
function markStale(items: QueueItem[], today: string): QueueItem[] {
  return items.map((item) =>
    item.runDate !== today &&
    (item.state === "queued" || item.state === "blocked" || item.state === "error")
      ? {
          ...item,
          state: "conflict",
          lastError: { kind: "conflict", message: STALE_MESSAGE },
          nextAttemptAt: undefined,
        }
      : item,
  );
}

// Per (run, student), in tap order: when the first unsent item has failed, the queued
// ones behind it are blocked; once it is sent, retried or discarded, they're queued again.
function blockBehindFailures(items: QueueItem[]): QueueItem[] {
  const headFailed = new Map<string, boolean>();
  return items.map((item) => {
    if (item.state === "synced") return item;
    const group = groupOf(item);
    const failed = headFailed.get(group);
    if (failed === undefined) {
      headFailed.set(group, item.state === "error" || item.state === "conflict");
      return item.state === "blocked" ? { ...item, state: "queued" } : item;
    }
    if (failed && item.state === "queued") return { ...item, state: "blocked" };
    if (!failed && item.state === "blocked") return { ...item, state: "queued" };
    return item;
  });
}

function isStoredQueue(value: unknown): value is { v: 1; items: QueueItem[] } {
  if (typeof value !== "object" || value === null) return false;
  const { v, items } = value as { v?: unknown; items?: unknown };
  return v === 1 && Array.isArray(items) && items.every(isStoredItem);
}

function isStoredItem(value: unknown): value is QueueItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    ["id", "clientRequestId", "runId", "runDate", "studentId", "occurredAt"].every(
      (field) => typeof item[field] === "string",
    ) &&
    typeof item.createdAt === "number" &&
    typeof item.attempts === "number" &&
    STATES.includes(item.state as QueueItemState) &&
    STATUSES.includes(item.status as ConfirmationStatus)
  );
}

function corrupt(): StorageError {
  return new StorageError("corrupt", "Saved confirmations on this device couldn't be read");
}

function unavailable(): StorageError {
  return new StorageError("unavailable", "Storage on this device can't be used");
}
