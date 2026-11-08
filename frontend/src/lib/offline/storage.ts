// Where the offline queue keeps its items between reloads. The queue only sees
// KeyValueStore, so tests use the memory store and the browser uses localStorage.
// Both are synchronous on purpose: an item and its clientRequestId are written in
// one call, before anything is sent (frontend/CLAUDE.md, SCRUM-273 decisions).
//
// Every failure is a StorageError, never a silent no-op: a store that can't be read
// or written must show up on the screen, because the driver otherwise believes a
// confirmation is saved on the phone when it isn't.

export type StorageErrorKind = "unavailable" | "quota" | "corrupt";

export class StorageError extends Error {
  readonly kind: StorageErrorKind;

  constructor(kind: StorageErrorKind, message: string) {
    super(message);
    this.name = "StorageError";
    this.kind = kind;
  }
}

export interface KeyValueStore {
  // Each throws StorageError when the store can't be used.
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  // Calls the listener with the key another tab changed (null: everything was
  // cleared). Not called for this store's own writes, like the storage event.
  subscribe(listener: (key: string | null) => void): () => void;
}

// One queue per signed-in user, so a second driver on the same phone never sees or
// sends the first one's confirmations.
export function queueStorageKey(userId: string): string {
  return `wassel.driver.queue.v1.${userId}`;
}

// localStorage can throw on every access: in a private window, with storage blocked
// for the site, or when it's full.
export function localStorageStore(win: Window = window): KeyValueStore {
  function storage(): Storage {
    try {
      return win.localStorage;
    } catch {
      throw new StorageError("unavailable", "Storage on this device can't be used");
    }
  }

  return {
    getItem(key) {
      const area = storage();
      try {
        return area.getItem(key);
      } catch {
        throw new StorageError("unavailable", "Storage on this device can't be read");
      }
    },
    setItem(key, value) {
      const area = storage();
      try {
        area.setItem(key, value);
      } catch (error) {
        throw isQuotaError(error)
          ? new StorageError("quota", "Storage on this device is full")
          : new StorageError("unavailable", "Storage on this device can't be written");
      }
    },
    removeItem(key) {
      const area = storage();
      try {
        area.removeItem(key);
      } catch {
        throw new StorageError("unavailable", "Storage on this device can't be written");
      }
    },
    subscribe(listener) {
      function onStorage(event: StorageEvent) {
        // The storage event also fires for sessionStorage; only localStorage counts.
        let area: Storage | null = null;
        try {
          area = win.localStorage;
        } catch {
          return;
        }
        if (event.storageArea === area) listener(event.key);
      }
      win.addEventListener("storage", onStorage);
      return () => win.removeEventListener("storage", onStorage);
    },
  };
}

// Browsers disagree on the name (QuotaExceededError; NS_ERROR_DOM_QUOTA_REACHED in
// old Firefox) and on the legacy code (22, 1014).
function isQuotaError(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

// An in-memory store for tests. tab() opens another handle on the same data, the
// way a second browser tab sees the same localStorage: a write through one handle
// notifies the others' subscribers, not its own.
export interface MemoryStore extends KeyValueStore {
  tab(): MemoryStore;
}

export function memoryStore(): MemoryStore {
  return memoryHandle({ data: new Map(), handles: new Set() });
}

interface MemoryShared {
  data: Map<string, string>;
  handles: Set<Set<(key: string | null) => void>>;
}

function memoryHandle(shared: MemoryShared): MemoryStore {
  const listeners = new Set<(key: string | null) => void>();
  shared.handles.add(listeners);

  function notifyOthers(key: string) {
    for (const handle of shared.handles) {
      if (handle === listeners) continue;
      for (const listener of handle) listener(key);
    }
  }

  return {
    getItem: (key) => shared.data.get(key) ?? null,
    setItem(key, value) {
      shared.data.set(key, value);
      notifyOthers(key);
    },
    removeItem(key) {
      shared.data.delete(key);
      notifyOthers(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tab: () => memoryHandle(shared),
  };
}
