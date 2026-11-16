// The offline confirmation queue (SCRUM-273): Picked up / Dropped off / Not present
// taps saved on the phone and sent once there is a connection, with no tap lost and
// none recorded twice. Framework-free: the driver screen binds it to React through
// subscribe/getSnapshot (useSyncExternalStore). What each server answer means is in
// docs/contracts/runs.md, "Offline replay and clientRequestId (SCRUM-263)"; the rest is
// client-only behaviour:
//
// - enqueue() gives each tap a clientRequestId and writes the item, key included, to
//   storage in that same synchronous call, before anything is sent. Every resend of
//   that item (automatic, after a reload, or the driver's Try again) reuses the key,
//   so the server can recognise it. Only a new tap gets a new key: no code path makes a
//   key for an item that already exists, and a stored key that isn't a UUID makes the
//   queue unreadable (corrupt) rather than a request the server would refuse forever.
// - A 200 (a repeat of an already-applied key included) is synced. A 404 or 409 drops
//   the item (the server stored no key for it) after refetching its run. The taps
//   queued behind it for that student are dropped too on a 404, or on a 409 when the
//   refetched run is no longer IN_PROGRESS: nothing for that run can be recorded any
//   more. A 409 while the run is still IN_PROGRESS refused that one move only (Not
//   present, then Dropped off, say), so the next tap still goes out and gets its own
//   answer; so does it when the run couldn't be refetched. A 422
//   or 400 (or 403) is never resent, since the same key would be refused again; the
//   driver can only dismiss it. A 401 pauses the queue with every item kept. Anything
//   else (network, timeout, 5xx) is resent with the same key after a backoff.
// - Items for one student on one run go out in the order they were tapped, one at a
//   time. While the first unsent one has failed, the ones behind it are "blocked".
// - Two tabs share one stored queue, and re-reading storage before a change isn't
//   enough: both can read the same state, and the second write erases the first.
//   So every change (read, change, write) runs under a write lock shared by the tabs,
//   held for that one synchronous step only. enqueue() can't wait for a lock, since
//   it must save the tap before it returns, so it writes the new item to a key of its
//   own (<key>.pending.<itemId>) that no other tab writes; the next change merges
//   those keys into the queue. Each change re-checks the stored item before touching
//   it, so an item discarded in one tab never comes back from another's stale copy.
//   Where the browser has no Web Locks, the write lock only covers this tab, and two
//   tabs can still read the same state: the second write can then undo the first's
//   state change (synced back to queued, say, which means a resend with the same key,
//   so the server still records it once). A tap still can't be lost, because enqueue()
//   never writes the queue key, only its own pending key.
// - A tab holds the drain lock while sending, so two tabs never send one item at once.

import type { ConfirmationReplayApi } from "../api/confirmationReplay";
import type { ConfirmationStatus, Run } from "../api/runs";
import { classifyFailure, type Failure } from "./classify";
import { newId } from "./ids";
import { createWriteLock, type DrainLock, type WriteLock } from "./lock";
import { StorageError, type KeyValueStore } from "./storage";

export type QueueItemState = "queued" | "sending" | "synced" | "conflict" | "error" | "blocked";

export interface QueueItemError {
  // retryable: sent again automatically after a backoff (and on Try again).
  // rejected: the server refused the request itself (400/403/422); never resent, only
  // dismissed.
  // conflict: the item is from an earlier day; never sent, only dismissed. (A 404/409
  // answer drops the item instead of keeping it.)
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
  // The moment of the tap, from the device's clock, for the screen to show. Never sent:
  // the server only uses its own time (runs.md "Known limits").
  occurredAt: string;
  // Tap order (ms since the epoch): later than every item the tab could see when it
  // was saved, so pending keys merge in the order they were tapped.
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
}

export type QueueEvent =
  // Sent and recorded; run is the server's answer, for the screen to redraw the stop.
  | { type: "synced"; item: QueueItem; run: Run }
  // A 404/409: the item was dropped (see QueueConflict).
  | ({ type: "conflict" } & QueueConflict)
  | { type: "auth" }
  // Whether the last attempt reached the server (any HTTP answer) or not, for Connectivity.
  | { type: "network"; reachable: boolean };

// What the queue did with a 404/409.
export interface QueueConflict {
  item: QueueItem;
  // The server's answer and its detail.
  status: number;
  message: string;
  // The run as refetch() found it afterwards: null when the day no longer has it (a
  // reassignment), undefined when it couldn't be refetched (or there's no refetch).
  run: Run | null | undefined;
  // How many later taps for that student were dropped with it, unsent.
  dropped: number;
}

// Refetches the run an item was for, after a 404/409: resolves with the run, null when
// the day no longer has it, or undefined when the refetch failed.
export type RefetchRun = (item: QueueItem) => Promise<Run | null | undefined>;

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
  api: ConfirmationReplayApi;
  lock: DrainLock;
  // Serializes changes to storage across tabs. Defaults to a Web Lock named after the
  // storage key (an in-tab chain where the browser has no Web Locks).
  writeLock?: WriteLock;
  // Today's date, "YYYY-MM-DD" in Asia/Beirut (the server's "today", runs.md).
  today?: () => string;
  newId?: () => string;
  onEvent?: (event: QueueEvent) => void;
  // Asked after every 404/409, before deciding whether the taps behind it still go.
  // Without it a 409's run counts as unknown, so those taps are kept.
  refetch?: RefetchRun;
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
  private readonly api: ConfirmationReplayApi;
  private readonly lock: DrainLock;
  private readonly writeLock: WriteLock;
  private readonly today: () => string;
  private readonly makeId: () => string;
  private readonly onEvent?: (event: QueueEvent) => void;
  private readonly refetch?: RefetchRun;
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
    this.writeLock = options.writeLock ?? createWriteLock({ name: this.key });
    this.today = options.today ?? (() => todayInBeirut());
    this.makeId = options.newId ?? (() => newId());
    this.onEvent = options.onEvent;
    this.refetch = options.refetch;
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
    };
    this.refresh();
    // Another tab's write: show it (cross-tab UI sync). Nothing is written back.
    this.unsubscribeStore = this.store.subscribe((key) => {
      if (key === null || key === this.key || key.startsWith(this.pendingPrefix)) this.refresh();
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
    let item: QueueItem;
    let next: QueueItem[];
    try {
      const current = this.tidy(this.load().items);
      // A repeat of the latest tap for this student, still waiting to go, changes nothing.
      const existing = duplicateOf(current, input);
      if (existing) {
        this.update({ items: current, storageError: null });
        return { ok: true, item: existing, duplicate: true };
      }
      const now = Date.now();
      item = {
        id: this.makeId(),
        clientRequestId: this.makeId(),
        runId: input.runId,
        runDate: input.runDate,
        studentId: input.studentId,
        status: input.status,
        occurredAt: new Date(now).toISOString(),
        createdAt: Math.max(now, ...current.map((i) => i.createdAt + 1)),
        attempts: 0,
        state: "queued",
      };
      // A key of its own, which only this call ever writes: no other tab's change
      // can overwrite it, so it needs no lock. The next change merges it.
      this.store.setItem(this.pendingKey(item.id), JSON.stringify({ v: 1, item }));
      next = this.tidy([...current, item]);
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      this.update({ storageError: error });
      return { ok: false, error };
    }
    this.update({ items: next, storageError: null });
    this.schedule();
    void this.flush();
    // Return it as shown (it may have come out blocked).
    return { ok: true, item: this.find(item.id) ?? item, duplicate: false };
  }

  // Sends every item that can go now, in order. Concurrent calls share one run, and a
  // tab that can't get the lock sends nothing (the tab holding it sends for both).
  drain(): Promise<void> {
    if (this.draining) return this.draining;
    if (this.disposed || this.snapshot.paused) return Promise.resolve();
    this.update({ draining: true });
    this.draining = this.runDrain().finally(() => {
      this.draining = null;
      this.update({ draining: false });
      this.schedule();
    });
    return this.draining;
  }

  // Try again on one item whose send failed in a way worth repeating (a retryable
  // error). It keeps its clientRequestId. A rejected item (400/403/422) would be refused
  // again with the same key, and an earlier day's item is never sent: both can only be
  // discarded. Resolves false when the stored item can't be retried (another tab may
  // have changed it).
  async retry(id: string): Promise<boolean> {
    let retried = false;
    const ok = await this.mutate((items) =>
      items.map((i) => {
        if (i.id !== id || !isAutoRetryable(i) || i.runDate !== this.today()) return i;
        retried = true;
        return { ...i, state: "queued", lastError: undefined, nextAttemptAt: undefined };
      }),
    );
    if (!ok || !retried) return false;
    void this.drain();
    return true;
  }

  // Removes one item that failed (error or conflict), on the driver's say-so.
  async discard(id: string): Promise<boolean> {
    let discarded = false;
    const ok = await this.mutate((items) =>
      items.filter((i) => {
        if (i.id !== id || !isFailed(i)) return true;
        discarded = true;
        return false;
      }),
    );
    if (!ok || !discarded) return false;
    void this.drain();
    return true;
  }

  // Another driver call got a 401: stop sending until resume(). Nothing in
  // storage changes; an item already on its way gets its own answer.
  pause(): void {
    if (!this.disposed) this.update({ paused: true });
  }

  // After a 401, once the driver has signed in again.
  resume(): Promise<void> {
    this.update({ paused: false });
    // The run that hit the 401 may still be winding down; joining it would send
    // nothing, so drain again once it has.
    const winding = this.draining;
    return winding ? winding.then(() => this.drain()) : this.drain();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.unsubscribeStore();
    this.listeners.clear();
  }

  private async runDrain(): Promise<void> {
    const result = await this.lock.run(async (keepAlive) => {
      // We hold the lock, so an item still "sending" was left by a tab that closed or
      // reloaded mid-send. It goes again with the same key; the server dedups it.
      const reset = await this.mutate((items) =>
        items.map((i) => (i.state === "sending" ? { ...i, state: "queued" } : i)),
      );
      if (!reset) return;
      while (!this.disposed && !this.snapshot.paused) {
        const now = Date.now();
        const next = pickNext(this.snapshot.items, now);
        if (!next) return;
        keepAlive();
        // Only if the stored item is still due: another tab may have changed it since
        // this tab's snapshot. Either way the snapshot is fresh again afterwards.
        let marked = false;
        const ok = await this.mutate((items) =>
          items.map((i) => {
            if (i.id !== next.id || !isDue(i, now)) return i;
            marked = true;
            return { ...i, state: "sending", attempts: i.attempts + 1 };
          }),
        );
        if (!ok) return;
        if (!marked) continue;
        if ((await this.send(this.find(next.id) ?? next)) === "stop") return;
      }
    });
    if (!result.acquired) this.lockBusyUntil = Date.now() + this.lockRetryMs;
  }

  private async send(item: QueueItem): Promise<"continue" | "stop"> {
    let run: Run;
    try {
      run = await this.api.confirm(
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
    await this.record(item.id, {
      state: "synced",
      syncedAt,
      serverStatus: 200,
      lastError: undefined,
      nextAttemptAt: undefined,
    });
    this.emit({ type: "synced", item: this.find(item.id) ?? { ...item, state: "synced" }, run });
    return "continue";
  }

  private async recordFailure(item: QueueItem, failure: Failure): Promise<"continue" | "stop"> {
    switch (failure.kind) {
      case "auth":
        // Kept as it was before the attempt; sent once the driver is signed in again.
        await this.record(item.id, { state: "queued", serverStatus: failure.status });
        this.update({ paused: true });
        this.emit({ type: "auth" });
        return "stop";
      case "conflict": {
        // The server stored no key for it (runs.md), so there is nothing to resend:
        // drop it. The taps behind it for this student go too when nothing for the
        // run can be recorded any more: a 404 (not this driver's run, or not on it), or
        // a 409 with the run no longer IN_PROGRESS. A 409 on a run still in progress
        // refused only this move, so the next tap goes out and gets its own answer.
        // Only if it is still stored as sending, like record().
        const run = await this.refetchQuietly(item);
        const dropLater =
          failure.status === 404 || (run !== undefined && run?.state !== "IN_PROGRESS");
        let dropped = 0;
        await this.mutate((items) => {
          const sent = items.find((i) => i.id === item.id && i.state === "sending");
          if (!sent) return items;
          return items.filter((i) => {
            if (i === sent) return false;
            const later =
              dropLater &&
              groupOf(i) === groupOf(sent) &&
              i.createdAt > sent.createdAt &&
              (i.state === "queued" || i.state === "blocked");
            if (later) dropped += 1;
            return !later;
          });
        });
        this.emit({
          type: "conflict",
          item,
          status: failure.status,
          message: failure.message,
          run,
          dropped,
        });
        return "continue";
      }
      case "rejected":
        // A 422 means this key was already used for a different tap: a bug on this side.
        if (failure.status === 422) console.error("Confirmation key refused:", failure.message);
        await this.record(item.id, {
          state: "error",
          serverStatus: failure.status,
          lastError: { kind: "rejected", message: failure.message },
          nextAttemptAt: undefined,
        });
        return "continue";
      case "retryable":
        await this.record(item.id, {
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

  // The run as it is now, for a 404/409; undefined when that can't be known.
  private async refetchQuietly(item: QueueItem): Promise<Run | null | undefined> {
    if (!this.refetch) return undefined;
    try {
      return await this.refetch(item);
    } catch {
      return undefined;
    }
  }

  // Records a send's result, only on an item still stored as sending: one removed or
  // changed meanwhile is left as it is.
  private record(id: string, patch: Partial<QueueItem>): Promise<boolean> {
    return this.mutate((items) =>
      items.map((i) => (i.id === id && i.state === "sending" ? { ...i, ...patch } : i)),
    );
  }

  // Merges the pending keys left by enqueue() into the queue.
  private flush(): Promise<boolean> {
    return this.mutate((items) => items);
  }

  // Under the write lock: read the queue and every pending key, merge them, apply the
  // change, tidy (prune, stale, blocked), write the queue, and only then remove the
  // pending keys it merged (after a crash in between, the next merge drops them by
  // id). Nothing changes in memory unless the write succeeded; a storage failure is
  // kept in the snapshot. Resolves whether the write succeeded.
  private mutate(change: (items: QueueItem[]) => QueueItem[]): Promise<boolean> {
    return this.writeLock.run(() => {
      let next: QueueItem[];
      let merged: string[];
      try {
        const loaded = this.load();
        merged = loaded.pendingKeys;
        next = this.tidy(change(this.tidy(loaded.items)));
        this.store.setItem(this.key, JSON.stringify({ v: 1, items: next }));
      } catch (error) {
        if (!(error instanceof StorageError)) throw error;
        this.update({ storageError: error });
        return false;
      }
      for (const key of merged) {
        try {
          this.store.removeItem(key);
        } catch (error) {
          if (!(error instanceof StorageError)) throw error;
          // Cleanup only: the queue itself was already written with this item merged
          // in, so enqueue() can still save new taps. The stray `<key>.pending.<id>`
          // entry just stays in storage; the next load() finds it again, sees its item
          // already in the queue, and retries the removal. A failure here must never
          // make the banner (canSave) say taps can't be saved, since they still can be.
        }
      }
      this.update({ items: next, storageError: null });
      this.schedule();
      return true;
    });
  }

  // Shows what storage holds (the queue and the pending keys), without writing or
  // taking the lock.
  private refresh() {
    try {
      this.update({ items: this.tidy(this.load().items), storageError: null });
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      this.update({ storageError: error });
    }
    this.schedule();
  }

  private get pendingPrefix(): string {
    return `${this.key}.pending.`;
  }

  private pendingKey(itemId: string): string {
    return `${this.pendingPrefix}${itemId}`;
  }

  // The merged view: the queue, then the pending items in tap order. A pending item
  // already in the queue (same id), or a repeat of the one before it (duplicateOf), is
  // dropped.
  private load(): { items: QueueItem[]; pendingKeys: string[] } {
    const items = this.loadQueue();
    const pendingKeys: string[] = [];
    const pending: QueueItem[] = [];
    for (const key of this.store.keys(this.pendingPrefix)) {
      const item = this.loadPending(key);
      if (item === null) continue; // Merged by another tab since keys() was read.
      pendingKeys.push(key);
      pending.push(item);
    }
    pending.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const item of pending) {
      const known = items.some((i) => i.id === item.id) || duplicateOf(items, item) !== undefined;
      if (!known) items.push(item);
    }
    return { items, pendingKeys };
  }

  private loadPending(key: string): QueueItem | null {
    const raw = this.store.getItem(key);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw corrupt();
    }
    if (!isStoredPending(parsed)) throw corrupt();
    return parsed.item;
  }

  private loadQueue(): QueueItem[] {
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
    const canSend = !this.snapshot.paused;
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
    if (pruneDue) void this.mutate((items) => items);
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

// The item a new tap only repeats: the newest unsent item for the same run and student,
// when it has the same status and is still waiting to go (queued, blocked or sending).
// After a failure, or with another tap in between (A, B, A), the tap is a new item, so
// the last one tapped is the one that ends up recorded.
function duplicateOf(items: readonly QueueItem[], input: EnqueueInput): QueueItem | undefined {
  for (let n = items.length - 1; n >= 0; n--) {
    const item = items[n];
    if (item.state === "synced" || groupOf(item) !== groupOf(input)) continue;
    const waiting = item.state === "queued" || item.state === "blocked" || item.state === "sending";
    return waiting && item.status === input.status ? item : undefined;
  }
  return undefined;
}

function groupOf(item: Pick<QueueItem, "runId" | "studentId">): string {
  return `${item.runId}/${item.studentId}`;
}

function isAutoRetryable(item: QueueItem): boolean {
  return item.state === "error" && item.lastError?.kind === "retryable";
}

function isFailed(item: QueueItem): boolean {
  return item.state === "error" || item.state === "conflict";
}

// Never tried, or a retryable failure whose backoff is over.
function isDue(item: QueueItem, now: number): boolean {
  return item.state === "queued" || (isAutoRetryable(item) && (item.nextAttemptAt ?? 0) <= now);
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
    if (isDue(item, now)) return item;
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

function isStoredPending(value: unknown): value is { v: 1; item: QueueItem } {
  if (typeof value !== "object" || value === null) return false;
  const { v, item } = value as { v?: unknown; item?: unknown };
  return v === 1 && isStoredItem(item);
}

// The format the backend accepts for clientRequestId (runs.md): any version, either case.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isStoredItem(value: unknown): value is QueueItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    ["id", "clientRequestId", "runId", "runDate", "studentId", "occurredAt"].every(
      (field) => typeof item[field] === "string",
    ) &&
    UUID.test(item.clientRequestId as string) &&
    typeof item.createdAt === "number" &&
    typeof item.attempts === "number" &&
    STATES.includes(item.state as QueueItemState) &&
    STATUSES.includes(item.status as ConfirmationStatus)
  );
}

function corrupt(): StorageError {
  return new StorageError("corrupt", "Saved confirmations on this device couldn't be read");
}
