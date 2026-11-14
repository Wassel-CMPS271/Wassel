"use client";

// Binds the framework-free OfflineQueue (SCRUM-273) to this screen: one queue per
// signed-in driver, in localStorage, drained through confirmationReplayApi (null
// until SCRUM-263, in which case nothing is ever sent — see confirmationReplay.ts).
// useSyncExternalStore is what makes the queue's own subscribe/getSnapshot usable as
// React state without copying it into a second source of truth.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCurrentUser } from "@/components/auth/RoleGuard";
import type { ConfirmationReplayApi } from "@/lib/api/confirmationReplay";
import type { Run } from "@/lib/api/runs";
import type { Connectivity } from "@/lib/offline/connectivity";
import { newId } from "@/lib/offline/ids";
import { createDrainLock } from "@/lib/offline/lock";
import { OfflineQueue, type QueueEvent, type QueueSnapshot } from "@/lib/offline/queue";
import { localStorageStore, queueStorageKey } from "@/lib/offline/storage";

export interface UseOfflineQueueOptions {
  // Null until SCRUM-263 (see confirmationReplay.ts): the caller passes the module's
  // `confirmationReplayApi` through, the same way useGpsSharing takes `driverGpsApi`
  // — injected rather than imported here, so a test can swap in a fake directly.
  api: ConfirmationReplayApi | null;
  // Null until the page has built its Connectivity (also in an effect).
  connectivity: Connectivity | null;
  // The server's answer to a synced item, for the screen to redraw that one stop.
  onSynced: (run: Run, studentId: string) => void;
  // The server disagrees with what the screen showed (a 404/409 on replay, or an
  // item left over from an earlier day): reload today's runs rather than guess.
  onConflict: () => void;
}

export interface UseOfflineQueueResult {
  queue: OfflineQueue | null;
  snapshot: QueueSnapshot;
}

const EMPTY_SNAPSHOT: QueueSnapshot = {
  items: [],
  paused: false,
  draining: false,
  storageError: null,
  replayAvailable: false,
};
const subscribeNothing = () => () => {};
const emptySnapshot = () => EMPTY_SNAPSHOT;

export function useOfflineQueue({
  api,
  connectivity,
  onSynced,
  onConflict,
}: UseOfflineQueueOptions): UseOfflineQueueResult {
  const userId = useCurrentUser().id;

  // So the queue (built once per userId, below) always calls the latest callback
  // without needing onSynced/onConflict to be stable across renders.
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;
  const connectivityRef = useRef(connectivity);
  connectivityRef.current = connectivity;

  // Built in an effect, not useMemo: the effect's cleanup disposes it, and React
  // Strict Mode (on by default in Next's App Router) runs cleanup + setup once
  // more on mount — a memoized instance would stay disposed (no timers, no
  // storage subscription) for the rest of the page's life. Null only before the
  // first effect has run, i.e. before anything can be tapped.
  const [queue, setQueue] = useState<OfflineQueue | null>(null);

  useEffect(() => {
    const key = queueStorageKey(userId);
    const store = localStorageStore();
    function onEvent(event: QueueEvent) {
      switch (event.type) {
        case "synced":
          onSyncedRef.current(event.run, event.item.studentId);
          return;
        case "conflict":
          onConflictRef.current();
          return;
        case "auth":
          // Already paused by the queue itself; resumed below once connectivity
          // says it's worth another attempt.
          return;
        case "network":
          if (event.reachable) connectivityRef.current?.reportSuccess();
          else connectivityRef.current?.reportFailure();
          return;
      }
    }
    const created = new OfflineQueue({
      store,
      storageKey: key,
      api,
      lock: createDrainLock({ name: `${key}.lock`, store, tabId: newId() }),
      onEvent,
    });
    setQueue(created);
    void created.drain(); // Whatever was left over from a previous visit.
    return () => created.dispose();
  }, [userId, api]);

  // A 401 pauses the queue until something suggests it's worth trying again: the
  // connection coming back, the tab becoming visible, or the periodic retry tick
  // (the same signals the queue already drains on) — resume() both un-pauses and
  // drains. With the session really gone this costs one 401 per tick, no more.
  useEffect(() => {
    if (!queue || !connectivity) return;
    return connectivity.onRetry(() => {
      void (queue.getSnapshot().paused ? queue.resume() : queue.drain());
    });
  }, [queue, connectivity]);

  const snapshot = useSyncExternalStore(
    queue?.subscribe ?? subscribeNothing,
    queue?.getSnapshot ?? emptySnapshot,
    queue?.getSnapshot ?? emptySnapshot,
  );

  return { queue, snapshot };
}
