// One tab sends the queue at a time. Two tabs open on the driver screen share one
// localStorage queue, and both would otherwise send the same items when the
// connection comes back. The server's clientRequestId dedup makes a double send
// harmless (docs/contracts/driver-gps-offline.md); this lock just keeps it rare.
//
// navigator.locks is the real lock (released by the browser when the tab closes or
// crashes). Where it's missing, a lease in storage stands in: a tab id and an expiry,
// renewed before each send, so a tab that died mid-send blocks the others only until
// the lease runs out.
//
// The write lock is a different thing: it serializes each change to the stored queue
// (read, change, write) across tabs, and is held only for that one synchronous step,
// never across a send. See WriteLock below.

import type { KeyValueStore } from "./storage";

export type LockResult<T> = { acquired: true; value: T } | { acquired: false };

export interface DrainLock {
  // Runs fn only when no other tab holds the lock, and resolves { acquired: false }
  // at once otherwise (never waits for it). fn calls keepAlive before each send.
  run<T>(fn: (keepAlive: () => void) => Promise<T>): Promise<LockResult<T>>;
}

// The part of the Web Locks API this needs (navigator.locks).
export interface LockManagerLike {
  request<T>(
    name: string,
    options: { ifAvailable?: boolean; mode?: "exclusive" | "shared" },
    callback: (lock: unknown) => Promise<T>,
  ): Promise<T>;
}

export function webLock(name: string, locks: LockManagerLike): DrainLock {
  return {
    run(fn) {
      return locks.request(name, { ifAvailable: true }, async (lock) => {
        // ifAvailable hands the callback null when another holder has it.
        if (!lock) return { acquired: false } as const;
        return { acquired: true, value: await fn(() => {}) } as const;
      });
    },
  };
}

interface Lease {
  tabId: string;
  expiresAt: number;
}

export interface LeaseLockOptions {
  store: KeyValueStore;
  key: string;
  tabId: string;
  // Longer than one send (the queue's request timeout) so a live tab never loses it.
  ttlMs?: number;
}

export const DEFAULT_LEASE_TTL_MS = 30_000;

// Best effort: two tabs reading an expired lease in the same instant can both take
// it, which is the double send the server's dedup already covers. If storage can't
// be used at all, the lock lets the tab through for the same reason: refusing would
// mean nothing is ever sent.
export function leaseLock({
  store,
  key,
  tabId,
  ttlMs = DEFAULT_LEASE_TTL_MS,
}: LeaseLockOptions): DrainLock {
  function read(): Lease | null {
    const raw = store.getItem(key);
    if (raw === null) return null;
    try {
      const lease = JSON.parse(raw) as Partial<Lease>;
      return typeof lease.tabId === "string" && typeof lease.expiresAt === "number"
        ? (lease as Lease)
        : null;
    } catch {
      return null; // A lease that doesn't parse holds nothing.
    }
  }

  function write() {
    store.setItem(key, JSON.stringify({ tabId, expiresAt: Date.now() + ttlMs }));
  }

  function tryAcquire(): boolean {
    try {
      const current = read();
      if (current && current.tabId !== tabId && current.expiresAt > Date.now()) return false;
      write();
      // Read back: if another tab wrote in between, the last writer has it.
      return read()?.tabId === tabId;
    } catch {
      return true;
    }
  }

  function release() {
    try {
      if (read()?.tabId === tabId) store.removeItem(key);
    } catch {
      // Expires on its own.
    }
  }

  function keepAlive() {
    try {
      if (read()?.tabId === tabId) write();
    } catch {
      // Nothing to renew if storage is gone.
    }
  }

  return {
    async run(fn) {
      if (!tryAcquire()) return { acquired: false };
      try {
        return { acquired: true, value: await fn(keepAlive) };
      } finally {
        release();
      }
    },
  };
}

export interface DrainLockOptions {
  name: string;
  store: KeyValueStore;
  tabId: string;
  locks?: LockManagerLike | undefined;
}

// navigator.locks when the browser has it, the storage lease otherwise.
export function createDrainLock({
  name,
  store,
  tabId,
  locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks,
}: DrainLockOptions): DrainLock {
  return locks ? webLock(name, locks) : leaseLock({ store, key: `${name}.lease`, tabId });
}

export interface WriteLock {
  // Waits for the lock (unlike DrainLock, it never gives up), runs fn, releases it.
  // fn must be synchronous: the lock is held for one change to storage, not a send.
  run<T>(fn: () => T): Promise<T>;
}

// An exclusive Web Lock named `${name}.write`, waited for: a change from another tab
// queues behind this one instead of interleaving with it.
export function webWriteLock(name: string, locks: LockManagerLike): WriteLock {
  return {
    run: (fn) => locks.request(`${name}.write`, { mode: "exclusive" }, async () => fn()),
  };
}

// Without Web Locks: a promise chain, so this tab's own changes go one at a time.
// Best effort across tabs, which it can't see. A tap still can't be lost, because
// enqueue() writes each new item to a key of its own (queue.ts).
export function inTabWriteLock(): WriteLock {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run(fn) {
      const result = tail.then(fn);
      tail = result.catch(() => {});
      return result;
    },
  };
}

export interface WriteLockOptions {
  name: string;
  locks?: LockManagerLike | undefined;
}

// navigator.locks when the browser has it, the in-tab chain otherwise.
export function createWriteLock({
  name,
  locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks,
}: WriteLockOptions): WriteLock {
  return locks ? webWriteLock(name, locks) : inTabWriteLock();
}
