import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LEASE_TTL_MS,
  createDrainLock,
  leaseLock,
  webLock,
  type LockManagerLike,
} from "./lock";
import { memoryStore, StorageError, type KeyValueStore } from "./storage";

const KEY = "wassel.driver.queue.v1.u-1.lease";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

// The Web Locks behaviour this relies on: with ifAvailable, a held lock hands the
// callback null instead of waiting.
function fakeLocks() {
  const held = new Set<string>();
  const manager: LockManagerLike = {
    async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
  return { manager, request: vi.spyOn(manager, "request") };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("leaseLock", () => {
  it("runs the function and releases the lease afterwards", async () => {
    const store = memoryStore();
    const lock = leaseLock({ store, key: KEY, tabId: "a" });

    const result = await lock.run(async () => {
      expect(JSON.parse(store.getItem(KEY)!)).toEqual({
        tabId: "a",
        expiresAt: Date.now() + DEFAULT_LEASE_TTL_MS,
      });
      return 42;
    });

    expect(result).toEqual({ acquired: true, value: 42 });
    expect(store.getItem(KEY)).toBeNull();
  });

  it("keeps a second tab out while the first holds it, and lets it in after", async () => {
    const store = memoryStore();
    const a = leaseLock({ store, key: KEY, tabId: "a" });
    const b = leaseLock({ store: store.tab(), key: KEY, tabId: "b" });
    const gate = deferred();
    const inB = vi.fn(async () => "b");

    const holding = a.run(() => gate.promise);
    expect(await b.run(inB)).toEqual({ acquired: false });
    expect(inB).not.toHaveBeenCalled();

    gate.resolve();
    await holding;
    expect(await b.run(inB)).toEqual({ acquired: true, value: "b" });
  });

  it("lets another tab in once a closed tab's lease has expired", async () => {
    const store = memoryStore();
    const a = leaseLock({ store, key: KEY, tabId: "a" });
    const b = leaseLock({ store: store.tab(), key: KEY, tabId: "b" });
    void a.run(() => new Promise(() => {})); // A tab that never finishes: closed mid-send.

    await vi.advanceTimersByTimeAsync(DEFAULT_LEASE_TTL_MS - 1);
    expect((await b.run(async () => 1)).acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await b.run(async () => 1)).acquired).toBe(true);
  });

  it("renews the lease on keepAlive, so a long drain keeps it", async () => {
    const store = memoryStore();
    const a = leaseLock({ store, key: KEY, tabId: "a" });
    const b = leaseLock({ store: store.tab(), key: KEY, tabId: "b" });
    const gate = deferred();
    let keepAlive!: () => void;
    const holding = a.run((renew) => {
      keepAlive = renew;
      return gate.promise;
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_LEASE_TTL_MS - 1_000);
    keepAlive();
    await vi.advanceTimersByTimeAsync(2_000);

    expect((await b.run(async () => 1)).acquired).toBe(false);
    gate.resolve();
    await holding;
  });

  it("releases the lease even when the function fails", async () => {
    const store = memoryStore();
    const a = leaseLock({ store, key: KEY, tabId: "a" });

    await expect(a.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    expect(store.getItem(KEY)).toBeNull();
  });

  it("doesn't release a lease another tab has taken since", async () => {
    const store = memoryStore();
    const a = leaseLock({ store, key: KEY, tabId: "a", ttlMs: 1_000 });

    await a.run(async () => {
      // a's lease ran out and b took it while a was still busy.
      store.setItem(KEY, JSON.stringify({ tabId: "b", expiresAt: Date.now() + 60_000 }));
    });

    expect(JSON.parse(store.getItem(KEY)!).tabId).toBe("b");
  });

  it("ignores a lease that doesn't parse", async () => {
    const store = memoryStore();
    store.setItem(KEY, "garbage");

    expect((await leaseLock({ store, key: KEY, tabId: "a" }).run(async () => 1)).acquired).toBe(true);
  });

  it("lets the tab through when storage can't be used (the server dedups)", async () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new StorageError("unavailable", "No");
      },
      setItem: () => {
        throw new StorageError("unavailable", "No");
      },
      removeItem: () => {
        throw new StorageError("unavailable", "No");
      },
      subscribe: () => () => {},
    };

    const result = await leaseLock({ store: broken, key: KEY, tabId: "a" }).run(async (keepAlive) => {
      keepAlive();
      return 1;
    });

    expect(result).toEqual({ acquired: true, value: 1 });
  });
});

describe("webLock", () => {
  it("asks for the lock only if it's free, and runs the function with it", async () => {
    const { manager, request } = fakeLocks();

    const result = await webLock("q", manager).run(async () => "done");

    expect(result).toEqual({ acquired: true, value: "done" });
    expect(request).toHaveBeenCalledWith("q", { ifAvailable: true }, expect.any(Function));
  });

  it("answers not acquired at once while another holder has it", async () => {
    const { manager } = fakeLocks();
    const a = webLock("q", manager);
    const b = webLock("q", manager);
    const gate = deferred();
    const inB = vi.fn(async () => 1);

    const holding = a.run(() => gate.promise);
    expect(await b.run(inB)).toEqual({ acquired: false });
    expect(inB).not.toHaveBeenCalled();

    gate.resolve();
    await holding;
    expect((await b.run(inB)).acquired).toBe(true);
  });
});

describe("createDrainLock", () => {
  it("uses navigator.locks when the browser has it", async () => {
    const { manager, request } = fakeLocks();
    const store = memoryStore();

    await createDrainLock({ name: "q", store, tabId: "a", locks: manager }).run(async () => {
      expect(store.getItem("q.lease")).toBeNull();
    });

    expect(request).toHaveBeenCalled();
  });

  it("falls back to a storage lease without it (as in jsdom)", async () => {
    const store = memoryStore();

    await createDrainLock({ name: "q", store, tabId: "a" }).run(async () => {
      expect(JSON.parse(store.getItem("q.lease")!).tabId).toBe("a");
    });

    expect(store.getItem("q.lease")).toBeNull();
  });
});
