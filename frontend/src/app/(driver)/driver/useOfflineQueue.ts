"use client";

// Binds the framework-free OfflineQueue (SCRUM-273) to this screen: one queue per
// signed-in driver, in localStorage, drained through confirmationReplayApi
// (lib/api/confirmationReplay.ts, the real PUT with each tap's clientRequestId).
// useSyncExternalStore is what makes the queue's own subscribe/getSnapshot usable as
// React state without copying it into a second source of truth.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCurrentUser } from "@/components/auth/RoleGuard";
import type { ConfirmationReplayApi } from "@/lib/api/confirmationReplay";
import type { Run } from "@/lib/api/runs";
import type { Connectivity } from "@/lib/offline/connectivity";
import { newId } from "@/lib/offline/ids";
import { createDrainLock } from "@/lib/offline/lock";
import {
  OfflineQueue,
  type QueueConflict,
  type QueueEvent,
  type QueueSnapshot,
  type RefetchRun,
} from "@/lib/offline/queue";
import { localStorageStore, queueStorageKey } from "@/lib/offline/storage";

export interface UseOfflineQueueOptions {
  // The caller passes the module's `confirmationReplayApi` through, the same way
  // useGpsSharing takes `driverGpsApi` — injected rather than imported here, so a
  // test can swap in a fake directly.
  api: ConfirmationReplayApi;
  // Null until the page has built its Connectivity (also in an effect).
  connectivity: Connectivity | null;
  // The server's answer to a synced item, for the screen to redraw that one stop.
  onSynced: (run: Run, studentId: string) => void;
  // A 404/409 on replay: asked first, to reload today's runs and say what the run
  // is now (the queue then decides whether the taps behind the refused one still go).
  // Without it, a 409's later taps are kept.
  refetchRun?: RefetchRun;
  // ...then told what the queue dropped, with the reloaded run (see QueueConflict).
  onConflict: (conflict: QueueConflict) => void;
  // A 401 on replay: the queue has paused itself and kept every item. Only the page
  // can tell a real sign-out from a stray 401 and send the driver to sign in; the
  // queue is resumed by the page, or by a new queue once the driver is back.
  onAuthExpired: () => void;
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
};
const subscribeNothing = () => () => {};
const emptySnapshot = () => EMPTY_SNAPSHOT;

export function useOfflineQueue({
  api,
  connectivity,
  onSynced,
  refetchRun,
  onConflict,
  onAuthExpired,
}: UseOfflineQueueOptions): UseOfflineQueueResult {
  const userId = useCurrentUser().id;

  // So the queue (built once per userId, below) always calls the latest callback
  // without needing onSynced/onConflict to be stable across renders.
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const refetchRunRef = useRef(refetchRun);
  refetchRunRef.current = refetchRun;
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;
  const onAuthExpiredRef = useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;
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
          onConflictRef.current({
            item: event.item,
            status: event.status,
            message: event.message,
            run: event.run,
            dropped: event.dropped,
          });
          return;
        case "auth":
          // Already paused by the queue itself, with the item back to queued under
          // its own key.
          onAuthExpiredRef.current();
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
      refetch: async (item) => refetchRunRef.current?.(item),
    });
    setQueue(created);
    // Whatever was left over from a previous visit (or from before signing in again):
    // a tap that got no answer goes now, not after a backoff stored before the reload.
    void created.sendWaitingNow();
    return () => created.dispose();
  }, [userId, api]);

  // The connection coming back, the tab becoming visible, or the periodic retry
  // tick drains whatever is due. Never while paused: a 401 means the session is
  // gone, and no tick brings it back. Only signing in again does (a new queue on
  // /driver), or the page calling resume().
  useEffect(() => {
    if (!queue || !connectivity) return;
    return connectivity.onRetry(() => {
      if (!queue.getSnapshot().paused) void queue.drain();
    });
  }, [queue, connectivity]);

  // The connection coming back (the browser's online event, or the server answering
  // after a failure) sends taps that got no answer at all now, not after their
  // backoff. Not on the periodic tick: that's for when no event says it's back.
  // While paused (401) this only moves their due time; nothing is sent until resume.
  useEffect(() => {
    if (!queue || !connectivity) return;
    let last = connectivity.getState();
    return connectivity.subscribe(() => {
      const next = connectivity.getState();
      const back = last === "offline" && next !== "offline";
      last = next;
      if (back) void queue.sendWaitingNow();
    });
  }, [queue, connectivity]);

  const snapshot = useSyncExternalStore(
    queue?.subscribe ?? subscribeNothing,
    queue?.getSnapshot ?? emptySnapshot,
    queue?.getSnapshot ?? emptySnapshot,
  );

  return { queue, snapshot };
}
