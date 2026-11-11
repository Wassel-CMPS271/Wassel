import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiValidationError } from "../api/errors";
import { DEFAULT_RETRY_INTERVAL_MS, createConnectivity, reportIfNetwork, type Connectivity } from "./connectivity";

let connectivity: Connectivity | undefined;

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
}

function create(...args: Parameters<typeof createConnectivity>) {
  connectivity = createConnectivity(...args);
  const retry = vi.fn();
  const changed = vi.fn();
  connectivity.onRetry(retry);
  connectivity.subscribe(changed);
  return { connectivity, retry, changed };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  connectivity?.dispose();
  connectivity = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createConnectivity", () => {
  it("starts unknown when the browser says it's online, since that's only a hint", () => {
    expect(create().connectivity.getState()).toBe("unknown");
  });

  it("starts offline when the browser says it's offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    expect(create().connectivity.getState()).toBe("offline");
  });

  it("goes offline on the offline event, and back to unknown with a retry on online", () => {
    const { connectivity, retry, changed } = create();

    window.dispatchEvent(new Event("offline"));
    expect(connectivity.getState()).toBe("offline");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("online"));
    expect(connectivity.getState()).toBe("unknown");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("counts a failed fetch as offline whatever navigator.onLine says", () => {
    const { connectivity } = create();

    connectivity.reportFailure();

    expect(navigator.onLine).toBe(true);
    expect(connectivity.getState()).toBe("offline");
  });

  it("is online only once the server answered, and retries when that ends an outage", () => {
    const { connectivity, retry } = create();

    connectivity.reportSuccess();
    expect(connectivity.getState()).toBe("online");
    expect(retry).not.toHaveBeenCalled();

    connectivity.reportFailure();
    connectivity.reportSuccess();
    expect(connectivity.getState()).toBe("online");
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("doesn't notify subscribers when nothing changed", () => {
    const { connectivity, changed } = create();

    connectivity.reportFailure();
    connectivity.reportFailure();
    window.dispatchEvent(new Event("offline"));

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("retries when the tab becomes visible again, not when it's hidden", () => {
    const { retry } = create();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(retry).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("retries on a timer while visible, since a phone changing towers fires no event", () => {
    const { retry } = create({ retryIntervalMs: 10_000 });

    vi.advanceTimersByTime(10_000);
    expect(retry).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    vi.advanceTimersByTime(30_000);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("uses a 30 second interval by default", () => {
    const { retry } = create();

    vi.advanceTimersByTime(DEFAULT_RETRY_INTERVAL_MS - 1);
    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("stops listening once disposed", () => {
    const { connectivity: disposed, retry, changed } = create();

    disposed.dispose();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(DEFAULT_RETRY_INTERVAL_MS * 3);

    expect(retry).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("lets a listener unsubscribe", () => {
    connectivity = createConnectivity();
    const retry = vi.fn();
    const changed = vi.fn();
    const stopRetry = connectivity.onRetry(retry);
    const stopChanged = connectivity.subscribe(changed);

    stopRetry();
    stopChanged();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));

    expect(retry).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("reportIfNetwork", () => {
  function spy() {
    return { reportSuccess: vi.fn(), reportFailure: vi.fn() } as unknown as Connectivity & {
      reportSuccess: ReturnType<typeof vi.fn>;
      reportFailure: ReturnType<typeof vi.fn>;
    };
  }

  it.each([
    ["a TypeError (network down)", new TypeError("Failed to fetch")],
    ["an AbortError (timeout)", Object.assign(new Error("aborted"), { name: "AbortError" })],
  ])("reports a failure for %s", (_label, error) => {
    const connectivity = spy();
    reportIfNetwork(connectivity, error);
    expect(connectivity.reportFailure).toHaveBeenCalledTimes(1);
    expect(connectivity.reportSuccess).not.toHaveBeenCalled();
  });

  it.each([
    ["ApiError(400)", new ApiError(400, "Bad request")],
    ["ApiError(403)", new ApiError(403)],
    ["ApiError(500)", new ApiError(500)],
    ["ApiValidationError", new ApiValidationError({ latitude: "out of range" })],
  ])("reports success for %s: the server answered", (_label, error) => {
    const connectivity = spy();
    reportIfNetwork(connectivity, error);
    expect(connectivity.reportSuccess).toHaveBeenCalledTimes(1);
    expect(connectivity.reportFailure).not.toHaveBeenCalled();
  });

  it("does nothing without a connectivity", () => {
    expect(() => reportIfNetwork(null, new TypeError("x"))).not.toThrow();
  });
});
