// Whether the driver's phone can reach the API, as far as the page can tell.
// navigator.onLine is only a hint: it says true on Wi-Fi with no internet or behind a
// captive portal, so true counts as "unknown", never as "online". Only an answer from
// the server (reportSuccess) makes it "online", and a fetch that fails or times out
// (reportFailure) makes it "offline" whatever navigator.onLine says.
//
// onRetry tells the queue when it's worth trying again: the browser says it's back
// online, the tab becomes visible again, the server answered after a failure, and
// every retryIntervalMs while the tab is visible (a phone moving between towers often
// fires no event at all).

import { isNetworkFailure } from "./classify";

export type ConnectivityState = "online" | "offline" | "unknown";

export interface Connectivity {
  getState(): ConnectivityState;
  // State changes; with getState, fits useSyncExternalStore.
  subscribe(listener: () => void): () => void;
  onRetry(listener: () => void): () => void;
  reportSuccess(): void;
  reportFailure(): void;
  dispose(): void;
}

export interface ConnectivityOptions {
  win?: Window;
  retryIntervalMs?: number;
}

export const DEFAULT_RETRY_INTERVAL_MS = 30_000;

export function createConnectivity({
  win = window,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
}: ConnectivityOptions = {}): Connectivity {
  let state: ConnectivityState = win.navigator.onLine === false ? "offline" : "unknown";
  const stateListeners = new Set<() => void>();
  const retryListeners = new Set<() => void>();

  function setState(next: ConnectivityState) {
    if (next === state) return;
    state = next;
    for (const listener of [...stateListeners]) listener();
  }

  function retry() {
    for (const listener of [...retryListeners]) listener();
  }

  function visible() {
    return win.document.visibilityState !== "hidden";
  }

  function onOnline() {
    setState("unknown");
    retry();
  }

  function onOffline() {
    setState("offline");
  }

  function onVisibility() {
    if (visible()) retry();
  }

  win.addEventListener("online", onOnline);
  win.addEventListener("offline", onOffline);
  win.document.addEventListener("visibilitychange", onVisibility);
  const interval = setInterval(() => {
    if (visible()) retry();
  }, retryIntervalMs);

  return {
    getState: () => state,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onRetry(listener) {
      retryListeners.add(listener);
      return () => retryListeners.delete(listener);
    },
    reportSuccess() {
      const wasOffline = state === "offline";
      setState("online");
      if (wasOffline) retry();
    },
    reportFailure() {
      setState("offline");
    },
    dispose() {
      win.removeEventListener("online", onOnline);
      win.removeEventListener("offline", onOffline);
      win.document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
      stateListeners.clear();
      retryListeners.clear();
    },
  };
}

// Reports what a failed call says about the connection. Only a network failure or a
// timeout (see isNetworkFailure) means the server wasn't reached; anything else, an
// ApiError or ApiValidationError of any status included, is an answer from it.
export function reportIfNetwork(connectivity: Connectivity | null, error: unknown) {
  if (isNetworkFailure(error)) {
    connectivity?.reportFailure();
  } else {
    connectivity?.reportSuccess();
  }
}
