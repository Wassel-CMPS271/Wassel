"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { MapView } from "@/components/map/MapView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Child } from "@/lib/api/myChildren";
import { ApiError } from "@/lib/api/errors";
import { hasBusProgress, type BusLocation } from "@/lib/api/parentTracking";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

import { LiveEtaCountdown } from "./LiveEtaCountdown";

import styles from "./TrackingPanel.module.css";

export type TrackingApi = (studentId: string) => Promise<BusLocation>;
type State = { scope: string; api: TrackingApi; value: BusLocation | null; received: number; error: number | null };
// Production enables accepted ETA; isolated GPS-only compositions remain supported.
export function TrackingPanel({ child, api = null, etaEnabled = false }: { child: Child; api?: TrackingApi | null; etaEnabled?: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scope = JSON.stringify([child.studentId, child.route?.id, child.driver?.id, child.todayRun?.direction, child.todayRun?.state]);
  const waiting = child.todayRun?.state === "IN_PROGRESS" && child.todayRun.stopsLeft !== null;
  useEffect(() => {
    if (!api || !waiting) return;
    let active = true, inFlight = false, stopped = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!active || inFlight || stopped || document.hidden) return;
      inFlight = true;
      try {
        const value = await api(child.studentId);
        failures = 0;
        if (active) { setState({ scope, api, value, received: performance.now(), error: null }); setElapsed(0); }
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        stopped = [401, 403, 404].includes(status);
        failures++;
        // Never retain coordinates or ETA after an unsuccessful read.
        if (active) setState({ scope, api, value: null, received: performance.now(), error: status });
      } finally {
        inFlight = false;
        if (active && !stopped && !document.hidden) {
          const delay = 15_000 * 2 ** Math.min(Math.max(failures - 1, 0), 3);
          timer = setTimeout(() => void load(), delay);
        }
      }
    };
    const visibilityChanged = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
    };
    setState(null);
    void load();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => { active = false; clearTimeout(timer); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [api, child.studentId, scope, waiting, attempt]);
  useEffect(() => {
    if (!waiting || !state?.value?.position || state.api !== api || state.scope !== scope) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setElapsed(Math.floor((performance.now() - state.received) / 1000));
    const visibilityChanged = () => {
      clearInterval(timer);
      tick();
      if (!document.hidden) timer = setInterval(tick, 1000);
    };
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [api, scope, state, waiting]);
  const current = state?.scope === scope && state.api === api ? state : null;
  const value = current?.value;
  const age = value?.position ? value.position.ageSeconds + elapsed : 0;
  const position = waiting && value?.status !== "UNAVAILABLE" && value?.position && age <= 300 ? value.position : null;
  const live = position && value?.status === "LIVE" && age <= 60;
  const progress = etaEnabled && value && hasBusProgress(value) ? value : null;
  const estimate = waiting && live && progress?.estimate ? progress.estimate : null;
  const retry = <Button variant="secondary" style={{ minHeight: sizing.tapTarget }} onClick={() => setAttempt(n => n + 1)}>Retry tracking</Button>;
  return <Card className="flex min-w-0 flex-col" style={{ gap: spacing.md, overflowWrap: "anywhere" }}>
    <h2 className="text-xl font-semibold">Bus tracking for {child.firstName} {child.lastName}</h2>
    {!progress && child.todayRun?.direction !== "AFTERNOON" && <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Planned morning pickup: {child.expectedPickupTime ?? "Not available"}. This is not a live estimate.</p>}
    {progress && waiting && <>
      <p>Stops remaining: {progress.stopsLeft ?? "Not available"}</p>
      <p>Planned {child.todayRun?.direction === "AFTERNOON" ? "drop-off" : "pickup"}: {progress.plannedTime ?? "Not available"}. This is not a live estimate.</p>
    </>}
    {estimate ? <LiveEtaCountdown estimate={estimate} elapsedSeconds={elapsed} /> : <p className="text-sm">Live arrival estimate is not available yet.</p>}
    {!api ? <p role="status">Live tracking is not available yet.</p>
      : !waiting ? <p role="status">{!child.todayRun ? "No run today." : child.todayRun.state === "NOT_STARTED" ? "Run not started." : child.todayRun.state === "FINISHED" ? "Run finished." : "Bus tracking is not available for this child."}</p>
      : !current ? <p role="status">Loading bus location…</p>
      : current.error !== null ? <><p role="alert" style={{ color: colors.error[500] }}>{current.error === 401 ? "Your sign-in has expired." : [403, 404].includes(current.error) ? "Bus tracking is not available for this child." : "Could not load bus location. Please try again."}</p>{current.error === 401 ? <Link href="/login" className="inline-flex items-center focus-visible:outline focus-visible:outline-2" style={{ minHeight: sizing.tapTarget, outlineColor: colors.primary[400] }}>Sign in</Link> : retry}</>
      : !position ? <><p role="status">Bus location is unavailable.</p>{retry}</>
      : <><p role="status">{live ? "Live bus location" : "This position is stale."}</p>
        {!live && <p aria-live="off">Last seen {age} seconds ago.</p>}
        <p className="text-sm">Location accuracy: {position.accuracyMeters} metres.</p>
        <div className={styles.map} style={{ "--parent-map-target": sizing.tapTarget } as CSSProperties}><MapView label={`Bus location for ${child.firstName} ${child.lastName}`} markers={[{ id: child.studentId, latitude: position.latitude, longitude: position.longitude, label: live ? "Current bus location" : "Last known bus location" }]} /></div>
      </>}
  </Card>;
}
