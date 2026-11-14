import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageError, localStorageStore, memoryStore, queueStorageKey } from "./storage";

afterEach(() => {
  window.localStorage.clear();
});

// A window whose localStorage throws the way a browser does.
function windowWith(localStorage: Partial<Storage> | (() => never)): Window {
  const win = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window;
  Object.defineProperty(win, "localStorage", {
    get: typeof localStorage === "function" ? localStorage : () => localStorage,
  });
  return win;
}

function storageError(fn: () => unknown): StorageError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(StorageError);
    return error as StorageError;
  }
  throw new Error("expected a StorageError");
}

describe("queueStorageKey", () => {
  it("is versioned and per user", () => {
    expect(queueStorageKey("u-1")).toBe("wassel.driver.queue.v1.u-1");
    expect(queueStorageKey("u-2")).not.toBe(queueStorageKey("u-1"));
  });
});

describe("localStorageStore", () => {
  it("reads, writes and removes through localStorage", () => {
    const store = localStorageStore();

    expect(store.getItem("k")).toBeNull();
    store.setItem("k", "v");
    expect(store.getItem("k")).toBe("v");
    expect(window.localStorage.getItem("k")).toBe("v");
    store.removeItem("k");
    expect(store.getItem("k")).toBeNull();
  });

  it.each([
    ["QuotaExceededError", new DOMException("Full", "QuotaExceededError")],
    ["old Firefox's name", Object.assign(new Error("Full"), { name: "NS_ERROR_DOM_QUOTA_REACHED" })],
    ["the legacy code 22", Object.assign(new Error("Full"), { code: 22 })],
  ])("turns a full store (%s) into a quota error", (_label, error) => {
    const store = localStorageStore(
      windowWith({
        setItem: () => {
          throw error;
        },
      }),
    );

    expect(storageError(() => store.setItem("k", "v")).kind).toBe("quota");
  });

  it("lists the keys that start with a prefix", () => {
    const store = localStorageStore();
    store.setItem("q.pending.a", "1");
    store.setItem("q.pending.b", "2");
    store.setItem("q", "3");
    store.setItem("other.pending.c", "4");

    expect(store.keys("q.pending.").sort()).toEqual(["q.pending.a", "q.pending.b"]);
    expect(store.keys("none.")).toEqual([]);
  });

  it("turns any other failure into an unavailable error", () => {
    const fail = () => {
      throw new Error("Blocked");
    };
    const store = localStorageStore(
      windowWith({ getItem: fail, setItem: fail, removeItem: fail, key: fail, length: 1 }),
    );

    expect(storageError(() => store.getItem("k")).kind).toBe("unavailable");
    expect(storageError(() => store.setItem("k", "v")).kind).toBe("unavailable");
    expect(storageError(() => store.removeItem("k")).kind).toBe("unavailable");
    expect(storageError(() => store.keys("k")).kind).toBe("unavailable");
  });

  it("is unavailable when localStorage itself can't be touched (blocked site data)", () => {
    const store = localStorageStore(
      windowWith(() => {
        throw new DOMException("Denied", "SecurityError");
      }),
    );

    expect(storageError(() => store.getItem("k")).kind).toBe("unavailable");
    expect(storageError(() => store.setItem("k", "v")).kind).toBe("unavailable");
    expect(storageError(() => store.keys("k")).kind).toBe("unavailable");
  });

  it("hears other tabs' localStorage changes, not sessionStorage's", () => {
    const store = localStorageStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "k", storageArea: window.localStorage }));
    window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: window.localStorage }));
    window.dispatchEvent(new StorageEvent("storage", { key: "s", storageArea: window.sessionStorage }));

    expect(listener.mock.calls).toEqual([["k"], [null]]);
    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", { key: "k", storageArea: window.localStorage }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("memoryStore", () => {
  it("reads, writes and removes", () => {
    const store = memoryStore();

    store.setItem("k", "v");
    expect(store.getItem("k")).toBe("v");
    store.removeItem("k");
    expect(store.getItem("k")).toBeNull();
  });

  it("shares data between tabs and tells the other tabs, not the writer", () => {
    const a = memoryStore();
    const b = a.tab();
    const heardByA = vi.fn();
    const heardByB = vi.fn();
    a.subscribe(heardByA);
    const unsubscribeB = b.subscribe(heardByB);

    a.setItem("k", "v");
    expect(b.getItem("k")).toBe("v");
    expect(heardByB).toHaveBeenCalledWith("k");
    expect(heardByA).not.toHaveBeenCalled();

    b.removeItem("k");
    expect(a.getItem("k")).toBeNull();
    expect(heardByA).toHaveBeenCalledWith("k");

    unsubscribeB();
    a.setItem("k", "w");
    expect(heardByB).toHaveBeenCalledTimes(1);
  });

  it("lists the keys that start with a prefix, the same from every tab", () => {
    const a = memoryStore();
    const b = a.tab();
    a.setItem("q.pending.a", "1");
    b.setItem("q.pending.b", "2");
    a.setItem("q", "3");

    expect(a.keys("q.pending.").sort()).toEqual(["q.pending.a", "q.pending.b"]);
    expect(b.keys("q.pending.").sort()).toEqual(["q.pending.a", "q.pending.b"]);
    b.removeItem("q.pending.a");
    expect(a.keys("q.pending.")).toEqual(["q.pending.b"]);
    expect(memoryStore().keys("q")).toEqual([]);
  });

  it("keeps separate stores apart", () => {
    const a = memoryStore();
    const other = memoryStore();

    a.setItem("k", "v");

    expect(other.getItem("k")).toBeNull();
  });
});
