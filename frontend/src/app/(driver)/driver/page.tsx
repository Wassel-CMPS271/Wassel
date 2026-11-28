"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { DriverIcon } from "@/components/ui/icons";
import { me } from "@/lib/api/auth";
import { confirmationReplayApi } from "@/lib/api/confirmationReplay";
import { driverGpsApi } from "@/lib/api/driverGps";
import {
  confirmStudent,
  getDriverToday,
  type ConfirmationStatus,
  type DriverDay,
  type Run,
  type RunStop,
} from "@/lib/api/runs";
import { createConnectivity, reportIfNetwork, type Connectivity } from "@/lib/offline/connectivity";
import type { OfflineQueue, QueueConflict, QueueItem } from "@/lib/offline/queue";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";
import { ConnectionBanner } from "./ConnectionBanner";
import { useDriverOfflineContext } from "./driverOfflineContext";
import { GpsSharingCard } from "./GpsSharingCard";
import { RunAction, actionError, isUnauthorized } from "./RunAction";
import { StopCard } from "./StopCard";
import { StopListSkeleton } from "./StopListSkeleton";
import { currentRun, nextConfirmations, projectRun, stopStates } from "./today";
import { useOfflineQueue } from "./useOfflineQueue";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const WAIT_FOR_SAVED =
  "This tap couldn't be saved on this phone, and an earlier saved tap for this stop hasn't been sent yet. Try again once it has.";

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
  // For a notice about a run that has left the screen (see onConflict).
  const dayRef = useRef(day);
  dayRef.current = day;
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

  // Set once the queue exists (below); the 401 handler needs it but is built first.
  const queueRef = useRef<OfflineQueue | null>(null);
  // In a ref so onAuthExpired stays the same function for the page's lifetime: the
  // day's load effect depends on it and must not re-run when the router changes.
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  // "retry": /me couldn't answer (offline, a 5xx), so the next connectivity tick
  // asks again. "redirecting": the session is gone and /login is on its way.
  const authCheck = useRef<"idle" | "checking" | "retry" | "redirecting">("idle");
  // A queue 401 is waiting on /me's answer: only then does a 200 resume the queue.
  const queueAuthPending = useRef(false);
  // A stray 401 from the queue (the session is still fine) resumes it once; a second
  // one before anything has synced leaves it paused, so a 401 that keeps coming back
  // can't turn into a loop. The banner's Send now still resumes it by hand.
  const strayResumeUsed = useRef(false);
  // /me said 401: the session is gone. The GPS card is told first (signedOut, so its
  // unmount sends nothing without a session), and /login only after that render.
  const [sessionExpired, setSessionExpired] = useState(false);

  // A 401 from the queue ("queue") or any other driver call: GPS, the day's load,
  // Start/End run, a tap sent directly ("other"). The queue pauses itself on its own
  // 401 and keeps every item, under its own key, in localStorage. /me then says
  // whether the session is really gone: if so, the queue is paused (if it wasn't
  // already) and the driver goes to /login?expired=1, and once signed in lands back
  // on /driver, where a new queue drains the same items with the same keys. If not,
  // another call's 401 leaves the queue alone, and the queue's own is resumed once.
  // Nothing here resumes the queue on a connectivity tick.
  const onAuthExpired = useCallback((source: "queue" | "other" = "other") => {
    if (source === "queue") queueAuthPending.current = true;
    if (authCheck.current === "checking" || authCheck.current === "redirecting") return;
    authCheck.current = "checking";
    me().then(
      () => {
        authCheck.current = "idle";
        const fromQueue = queueAuthPending.current;
        queueAuthPending.current = false;
        if (!fromQueue || strayResumeUsed.current) return;
        strayResumeUsed.current = true;
        void queueRef.current?.resume();
        // Taps that got no answer before the 401 go now, not after their backoff.
        void queueRef.current?.sendWaitingNow();
      },
      (error) => {
        if (isUnauthorized(error)) {
          authCheck.current = "redirecting";
          queueAuthPending.current = false;
          queueRef.current?.pause();
          setSessionExpired(true);
          return;
        }
        reportIfNetwork(connectivityRef.current, error);
        authCheck.current = "retry";
      },
    );
  }, []);

  // After the render that told the GPS card it's signed out: child effects run
  // before this one, so its teardown has already seen signedOut.
  useEffect(() => {
    if (sessionExpired) routerRef.current.replace("/login?expired=1");
  }, [sessionExpired]);

  useEffect(() => {
    if (!connectivity) return;
    return connectivity.onRetry(() => {
      if (authCheck.current === "retry") onAuthExpired();
    });
  }, [connectivity, onAuthExpired]);

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
        if (isUnauthorized(error)) onAuthExpired();
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, onAuthExpired]);

  // Reloads the day in place, without the skeleton: unmounting Today would also
  // unmount the GPS card, and its cleanup turns location sharing off. Resolves
  // with the new day, or null when the reload failed.
  const refresh = useCallback(
    (): Promise<DriverDay | null> =>
      getDriverToday()
        .then((result) => {
          connectivityRef.current?.reportSuccess();
          setDay(result);
          setLoadFailed(false);
          return result;
        })
        .catch((error) => {
          reportIfNetwork(connectivityRef.current, error);
          if (isUnauthorized(error)) onAuthExpired();
          return null;
        }),
    [onAuthExpired],
  );

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

  // The server's detail for a stop whose saved tap it refused with a 404/409 (the
  // queue drops those items), until the driver taps that stop again. In page
  // state, not storage: after the refetch the stop shows what the server holds.
  const [notices, setNotices] = useState<ReadonlyMap<string, string>>(new Map());
  const clearNotice = useCallback(
    (key: string) => setNotices((current) => without(current, key)),
    [],
  );

  // A notice about a run that is no longer on the screen (a 404 after it was
  // reassigned to another driver), so no stop card can show it.
  const [pageNotice, setPageNotice] = useState<string | null>(null);

  // The server disagrees with what this screen showed (the run ended or was
  // reassigned, or the move isn't allowed any more): the queue asks for the day
  // to be reloaded (refetchRun) before deciding what to drop, then reports it.
  const refetchRun = useCallback(
    (item: QueueItem): Promise<Run | null | undefined> =>
      refresh().then((fresh) =>
        fresh ? (fresh.runs.find((run) => run.id === item.runId) ?? null) : undefined,
      ),
    [refresh],
  );

  // A 409 for a status the stop already has is no failure (runs.md: a second tap
  // first sent after End run), so it shows nothing. A run the reloaded day no
  // longer has (reassigned), or one that is FINISHED, has no card on the screen any
  // more, so its notice goes on the page instead, with the student's name.
  const onConflict = useCallback(({ item, status, message, run, dropped }: QueueConflict) => {
    const stop = run?.stops.find((s) => s.studentId === item.studentId);
    if (status === 409 && stop && alreadyRecorded(stop, item.status) && dropped === 0) return;
    if (run === null || run?.state === "FINISHED") {
      const known =
        stop ?? dayRef.current?.runs.flatMap((r) => r.stops).find((s) => s.studentId === item.studentId);
      const who = known ? `${known.firstName} ${known.lastName}` : "that student";
      setPageNotice(withNotSentNote(message, dropped, `for ${who}`));
      return;
    }
    setNotices((current) =>
      new Map(current).set(
        stopKey(item.runId, item.studentId),
        withNotSentNote(message, dropped, "for this stop"),
      ),
    );
  }, []);

  const onQueueAuthExpired = useCallback(() => onAuthExpired("queue"), [onAuthExpired]);

  const { queue, snapshot } = useOfflineQueue({
    api: confirmationReplayApi,
    connectivity,
    onSynced: (run, studentId) => {
      strayResumeUsed.current = false;
      replaceStop(run, studentId);
    },
    refetchRun,
    onConflict,
    onAuthExpired: onQueueAuthExpired,
  });
  queueRef.current = queue;

  // The sidebar's UserBlock (layout.tsx) warns before signing out while this is
  // true — it's a sibling of this page, not a parent or child, hence the context.
  // An earlier day's item (conflict) is never sent, so it doesn't count.
  const { setHasUnsentConfirmations } = useDriverOfflineContext();
  useEffect(() => {
    setHasUnsentConfirmations(
      snapshot.items.some((item) => item.state !== "synced" && item.state !== "conflict"),
    );
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

      {pageNotice && (
        <p role="status" className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {pageNotice}
        </p>
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
          queueSaving={snapshot.storageError === null}
          sessionExpired={sessionExpired}
          notices={notices}
          onClearNotice={clearNotice}
          onAuthExpired={onAuthExpired}
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

// Whether the server's stop already holds what was tapped: the same status, or
// DROPPED_OFF for a Picked up (dropping off implies the pick-up).
function alreadyRecorded(stop: RunStop, tapped: ConfirmationStatus): boolean {
  const recorded = stop.confirmation?.status;
  return recorded === tapped || (tapped === "PICKED_UP" && recorded === "DROPPED_OFF");
}

// The server's detail, plus how many later taps (for, say, "for this stop") the
// queue dropped unsent with it, when it dropped any.
function withNotSentNote(message: string, dropped: number, scope: string): string {
  if (dropped === 0) return message;
  const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
  const taps = dropped === 1 ? `1 later tap ${scope} was` : `${dropped} later taps ${scope} were`;
  return `${sentence} ${taps} not sent.`;
}

// Whether a stop has a saved tap still to send (an earlier day's item never will be).
function hasUnsentForStop(items: readonly QueueItem[], runId: string, studentId: string): boolean {
  return items.some(
    (item) =>
      item.runId === runId &&
      item.studentId === studentId &&
      item.state !== "synced" &&
      item.state !== "conflict",
  );
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
  queueSaving,
  sessionExpired,
  notices,
  onClearNotice,
  onAuthExpired,
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
  // False while the phone's storage is failing (full, blocked or unreadable):
  // taps then can't be saved and go straight to the server.
  queueSaving: boolean;
  // /me confirmed a 401: the page is leaving for /login (see the page).
  sessionExpired: boolean;
  // The server's detail per stop after a dropped 404/409 (see the page).
  notices: ReadonlyMap<string, string>;
  onClearNotice: (key: string) => void;
  // A 401 from any call made here (see the page).
  onAuthExpired: () => void;
}) {
  // Online-only fallback, used only when a tap can't be saved on the phone
  // (enqueue refused: storage full, blocked or unreadable). It sends no key,
  // which runs.md allows. Per stop, so one stop's request never locks or errors
  // the others.
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
      if (isUnauthorized(err)) onAuthExpired();
      setErrors((current) => new Map(current).set(key, { status, message: actionError(err) }));
    } finally {
      busy.current.delete(key);
      setPending((current) => without(current, key));
    }
  }

  // The direct path only while the stop has no saved tap still to send: a direct
  // request could otherwise reach the server before an older saved tap for the
  // same stop, and the older one would then undo or refuse the newer. The tap is
  // refused with a message instead, and Try again sends it once the saved one is.
  function confirmDirect(runId: string, studentId: string, status: ConfirmationStatus) {
    if (hasUnsentForStop(queueItems, runId, studentId)) {
      setErrors((current) =>
        new Map(current).set(stopKey(runId, studentId), { status, message: WAIT_FOR_SAVED }),
      );
      return;
    }
    void confirmOnline(runId, studentId, status);
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

  // Every tap goes through the offline queue, online or offline: it is saved
  // with its own clientRequestId first, so a timeout or a lost answer is safe
  // to resend.
  function confirm(runId: string, studentId: string, status: ConfirmationStatus) {
    onClearNotice(stopKey(runId, studentId));
    const saved = queue.enqueue({ runId, runDate: run.date, studentId, status });
    // Storage full, blocked or unreadable: the tap was not saved, so it goes
    // straight to the server instead (when nothing saved for the stop is ahead of
    // it) — never silently dropped.
    if (!saved.ok) {
      confirmDirect(runId, studentId, status);
      return;
    }
    void queue.drain();
  }

  const states = stopStates(run);
  const doneCount = states.filter((state) => state === "done").length;
  const skipCount = states.filter((state) => state === "skip").length;
  const hasNext = states.includes("next");
  const hasUnsentForRun = queueItems.some(
    (item) => item.runId === run.id && item.state !== "synced",
  );
  const savedCount = queueItems.filter((item) => item.state !== "synced").length;

  return (
    <>
      <ConnectionBanner
        state={connectivityState}
        paused={queuePaused}
        sessionExpired={sessionExpired}
        savedCount={savedCount}
        canSave={queueSaving}
        onSendNow={() => {
          if (queuePaused) void queue.resume();
          void queue.sendWaitingNow();
        }}
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
          onAuthExpired={onAuthExpired}
        />
        <GpsSharingCard
          run={run}
          api={driverGpsApi}
          connectivity={connectivity}
          onRunChange={onRunChange}
          onRefreshRequested={onRefresh}
          onAuthExpired={onAuthExpired}
          signedOut={sessionExpired}
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
              notice={notices.get(key) ?? null}
              onConfirm={(status) => confirm(run.id, stop.studentId, status)}
              onRetry={() => error && confirmDirect(run.id, stop.studentId, error.status)}
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
