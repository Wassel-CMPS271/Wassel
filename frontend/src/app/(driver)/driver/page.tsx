"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Button } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { DriverIcon } from "@/components/ui/icons";
import { confirmationReplayApi } from "@/lib/api/confirmationReplay";
import { driverGpsApi } from "@/lib/api/driverGps";
import {
  confirmStudent,
  getDriverToday,
  type ConfirmationStatus,
  type DriverDay,
  type Run,
} from "@/lib/api/runs";
import { createConnectivity, reportIfNetwork, type Connectivity } from "@/lib/offline/connectivity";
import type { OfflineQueue, QueueItem } from "@/lib/offline/queue";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";
import { ConnectionBanner } from "./ConnectionBanner";
import { useDriverOfflineContext } from "./driverOfflineContext";
import { GpsSharingCard } from "./GpsSharingCard";
import { RunAction, actionError } from "./RunAction";
import { StopCard } from "./StopCard";
import { StopListSkeleton } from "./StopListSkeleton";
import { currentRun, nextConfirmations, projectRun, stopStates } from "./today";
import { useOfflineQueue } from "./useOfflineQueue";

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Tighter page padding on phones, so the cards keep their width. Token values
// go through CSS variables because Tailwind can't see runtime class names.
const pageStyle = {
  "--page-pad-phone": spacing.md,
  "--page-pad": spacing.xl,
  gap: spacing.lg,
  maxWidth: sizing.pageMaxWidth,
} as CSSProperties;

const eyebrowStyle: CSSProperties = { color: colors.accent[300] };

// The driver's Today screen (SCRUM-243): the current run and its stops, with
// the next stop highlighted, Start run / End run and the per-stop Picked up /
// Dropped off / Not present buttons (SCRUM-244). Maps and call buttons are
// SCRUM-245. SCRUM-273 adds the offline confirmation queue and GPS opt-in: one
// Connectivity instance and one OfflineQueue for the whole screen (both built in
// useOfflineQueue), drained on reconnect, and GpsSharingCard for the current run.
export default function DriverTodayPage() {
  const [day, setDay] = useState<DriverDay | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // One instance for the whole screen's lifetime: the queue and the GPS hook
  // both report to it, and both read from it, so a position send and a
  // confirmation send agree on whether the backend is reachable right now.
  // Built in an effect (not useMemo) so React Strict Mode's extra cleanup +
  // setup on mount leaves a live instance rather than a disposed one.
  const [connectivity, setConnectivity] = useState<Connectivity | null>(null);
  const connectivityRef = useRef<Connectivity | null>(null);
  useEffect(() => {
    const created = createConnectivity();
    connectivityRef.current = created;
    setConnectivity(created);
    return () => created.dispose();
  }, []);

  useEffect(() => {
    let active = true;
    setDay(null);
    setLoadFailed(false);
    getDriverToday()
      .then((result) => {
        connectivityRef.current?.reportSuccess();
        if (active) setDay(result);
      })
      .catch((error) => {
        reportIfNetwork(connectivityRef.current, error);
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  // Reloads the day in place, without the skeleton: unmounting Today would also
  // unmount the GPS card, and its cleanup turns location sharing off.
  const refresh = useCallback(() => {
    getDriverToday()
      .then((result) => {
        connectivityRef.current?.reportSuccess();
        setDay(result);
        setLoadFailed(false);
      })
      .catch((error) => reportIfNetwork(connectivityRef.current, error));
  }, []);

  // A reconnect (or the periodic retry tick) with the state still unknown or
  // offline: the reload doubles as the check that settles it, and recovers a
  // first load that failed offline.
  useEffect(() => {
    if (!connectivity) return;
    return connectivity.onRetry(() => {
      if (connectivity.getState() !== "online") refresh();
    });
  }, [connectivity, refresh]);

  // Swap in the run a start/end call returned, without reloading the day.
  function replaceRun(updated: Run) {
    setDay((current) =>
      current && {
        ...current,
        runs: current.runs.map((run) => (run.id === updated.id ? updated : run)),
      },
    );
  }

  // Swap in one stop (and the counts) from the run a confirmation returned.
  // Only that stop: two stops confirmed at once can answer out of order, and
  // the older answer mustn't undo the newer one's stop.
  function replaceStop(updated: Run, studentId: string) {
    const stop = updated.stops.find((s) => s.studentId === studentId);
    if (!stop) return;
    setDay((current) =>
      current && {
        ...current,
        runs: current.runs.map((run) =>
          run.id === updated.id
            ? {
                ...run,
                counts: updated.counts,
                stops: run.stops.map((s) => (s.studentId === studentId ? stop : s)),
              }
            : run,
        ),
      },
    );
  }

  const { queue, snapshot } = useOfflineQueue({
    api: confirmationReplayApi,
    connectivity,
    onSynced: replaceStop,
    // The server disagrees with what this screen showed (a stale confirmation,
    // or one for a run that's no longer today's): reload rather than guess.
    onConflict: refresh,
  });

  // The sidebar's UserBlock (layout.tsx) warns before signing out while this is
  // true — it's a sibling of this page, not a parent or child, hence the context.
  const { setHasUnsentConfirmations } = useDriverOfflineContext();
  useEffect(() => {
    setHasUnsentConfirmations(snapshot.items.some((item) => item.state !== "synced"));
  }, [snapshot.items, setHasUnsentConfirmations]);

  return (
    <main
      className="mx-auto w-full flex flex-col p-[var(--page-pad-phone)] sm:p-[var(--page-pad)]"
      style={pageStyle}
    >
      {!day && !loadFailed && (
        <>
          <span className="sr-only" role="status">
            Loading today&apos;s run…
          </span>
          <StopListSkeleton />
        </>
      )}

      {loadFailed && (
        <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Couldn&apos;t load today&apos;s run
          </h1>
          <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
            {GENERIC_ERROR}
          </p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {day && connectivity && queue && (
        <Today
          day={day}
          onRunChange={replaceRun}
          onStopChange={replaceStop}
          onRefresh={refresh}
          connectivity={connectivity}
          queue={queue}
          queueItems={snapshot.items}
          queuePaused={snapshot.paused}
        />
      )}
    </main>
  );
}

interface StopError {
  status: ConfirmationStatus;
  message: string;
}

// Keyed by run and student: the same students ride the afternoon run, and a
// morning failure mustn't show up there.
function stopKey(runId: string, studentId: string): string {
  return `${runId}/${studentId}`;
}

// The one item to show on a stop's card: the earliest one still unsent (that's
// what's actually blocking it — see projectRun in today.ts), or else a just-
// synced one on its way to being pruned, so "Sent" has a moment to show. null
// when there's nothing for this stop at all.
function queueItemForStop(
  items: readonly QueueItem[],
  runId: string,
  studentId: string,
): QueueItem | null {
  const forStop = items.filter((item) => item.runId === runId && item.studentId === studentId);
  return forStop.find((item) => item.state !== "synced") ?? forStop.find((item) => item.state === "synced") ?? null;
}

function Today({
  day,
  onRunChange,
  onStopChange,
  onRefresh,
  connectivity,
  queue,
  queueItems,
  queuePaused,
}: {
  day: DriverDay;
  onRunChange: (run: Run) => void;
  onStopChange: (run: Run, studentId: string) => void;
  // Reloads the day in place, keeping Today (and the GPS card) mounted.
  onRefresh: () => void;
  connectivity: Connectivity;
  queue: OfflineQueue;
  queueItems: readonly QueueItem[];
  queuePaused: boolean;
}) {
  // Online-only fallback, used only while confirmationReplayApi is null
  // (SCRUM-263 not merged): unchanged from before the offline queue existed.
  // Per stop, so one stop's request never locks or errors the others.
  const [pending, setPending] = useState<ReadonlyMap<string, ConfirmationStatus>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, StopError>>(new Map());
  // Blocks a second tap on a stop before its disabled state has rendered.
  const busy = useRef(new Set<string>());

  const connectivityState = useSyncExternalStore(
    connectivity.subscribe,
    connectivity.getState,
    connectivity.getState,
  );

  async function confirmOnline(runId: string, studentId: string, status: ConfirmationStatus) {
    const key = stopKey(runId, studentId);
    if (busy.current.has(key)) return;
    busy.current.add(key);
    setPending((current) => new Map(current).set(key, status));
    setErrors((current) => without(current, key));
    try {
      const updated = await confirmStudent(runId, studentId, status);
      connectivity.reportSuccess();
      onStopChange(updated, studentId);
    } catch (err) {
      reportIfNetwork(connectivity, err);
      setErrors((current) => new Map(current).set(key, { status, message: actionError(err) }));
    } finally {
      busy.current.delete(key);
      setPending((current) => without(current, key));
    }
  }

  if (day.dayType === "HOLIDAY") {
    return <EmptyState title="No school today" text="Today is a holiday, so there are no runs." />;
  }
  if (day.runs.length === 0) {
    return (
      <EmptyState
        title="No route today"
        text="You aren't assigned to a route. If that's wrong, contact the head of transportation."
      />
    );
  }

  const serverRun = currentRun(day);
  if (!serverRun) {
    return <EmptyState title="All runs done" text="You've finished every run for today." />;
  }

  // What the driver tapped, overlaid on the server's answer — so a queued-but-
  // unsent confirmation already shows as done, offers its next action, and
  // counts toward "N of M stops done" (today.ts).
  const run = projectRun(serverRun, queueItems);

  // Confirmations go through the offline queue once there's something to
  // replay them with (SCRUM-263); until then they're sent directly, same as
  // before the queue existed.
  function confirm(runId: string, studentId: string, status: ConfirmationStatus) {
    if (confirmationReplayApi) {
      const saved = queue.enqueue({ runId, runDate: run.date, studentId, status });
      // Storage full, blocked or unreadable: the tap was not saved, so it goes
      // straight to the server instead — never silently dropped.
      if (!saved.ok) {
        void confirmOnline(runId, studentId, status);
        return;
      }
      void queue.drain();
    } else {
      void confirmOnline(runId, studentId, status);
    }
  }

  const states = stopStates(run);
  const doneCount = states.filter((state) => state === "done").length;
  const skipCount = states.filter((state) => state === "skip").length;
  const hasNext = states.includes("next");
  const hasUnsentForRun = queueItems.some(
    (item) => item.runId === run.id && item.state !== "synced",
  );
  const savedCount = queueItems.filter((item) => item.state !== "synced").length;
  const replayAvailable = confirmationReplayApi !== null;

  return (
    <>
      <ConnectionBanner
        state={connectivityState}
        paused={queuePaused}
        savedCount={savedCount}
        replayAvailable={replayAvailable}
        onSendNow={() => void (queuePaused ? queue.resume() : queue.drain())}
      />

      <header className="flex flex-col" style={{ gap: spacing.sm }}>
        <p className="text-xs font-medium uppercase tracking-wider" style={eyebrowStyle}>
          {run.direction === "MORNING" ? "Morning run" : "Afternoon run"}
        </p>
        <h1
          className="text-2xl font-semibold break-words"
          style={{ color: darkTheme.text.primary }}
        >
          {run.route.name}
        </h1>
        <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
          <LicensePlate plateNumber={run.vehicle.plateNumber} />
          <span
            className="flex items-center text-sm"
            style={{ gap: spacing.xs, color: darkTheme.text.secondary }}
          >
            <DriverIcon size={16} />
            {run.driver.firstName} {run.driver.lastName}
          </span>
        </div>
        <RunAction
          run={run}
          onRunChange={onRunChange}
          offline={connectivityState === "offline"}
          hasUnsentConfirmations={hasUnsentForRun}
        />
        <GpsSharingCard
          run={run}
          api={driverGpsApi}
          connectivity={connectivity}
          onRunChange={onRunChange}
          onRefreshRequested={onRefresh}
        />
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {doneCount} of {run.stops.length} stops done
          {skipCount > 0 && ` · ${skipCount} to skip`}
        </p>
      </header>

      {!hasNext && run.stops.length > 0 && (
        <p
          role="status"
          className="text-sm font-medium"
          style={{ color: darkTheme.text.secondary }}
        >
          Every stop on this run is done or skipped.
        </p>
      )}

      <ol
        aria-label="Stops"
        className="flex flex-col"
        style={{ gap: spacing.sm, padding: 0, margin: 0 }}
      >
        {run.stops.map((stop, index) => {
          const key = stopKey(run.id, stop.studentId);
          const error = errors.get(key);
          const queueItem = queueItemForStop(queueItems, run.id, stop.studentId);
          return (
            <StopCard
              key={stop.studentId}
              stop={stop}
              state={states[index]}
              index={index}
              actions={nextConfirmations(run, stop)}
              pendingStatus={pending.get(key) ?? null}
              error={error?.message ?? null}
              onConfirm={(status) => confirm(run.id, stop.studentId, status)}
              onRetry={() => error && confirmOnline(run.id, stop.studentId, error.status)}
              queueItem={queueItem}
              onRetryQueueItem={() => queueItem && queue.retry(queueItem.id)}
              onDismissQueueItem={() => queueItem && queue.discard(queueItem.id)}
            />
          );
        })}
      </ol>
    </>
  );
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div
      className="flex flex-col items-start text-left"
      style={{
        padding: spacing.xl,
        border: `1px dashed ${darkTheme.surface.cardBorder}`,
        borderRadius: radius.lg,
        backgroundColor: darkTheme.surface.emptyState,
        gap: spacing.sm,
      }}
    >
      <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
        {title}
      </h1>
      <p
        className="text-sm"
        style={{ color: darkTheme.text.muted, maxWidth: sizing.emptyStateText }}
      >
        {text}
      </p>
    </div>
  );
}
