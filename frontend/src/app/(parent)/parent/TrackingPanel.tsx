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
// GPS is accepted. ETA stays opt-in for isolated contract testing until #153 merges.
export function TrackingPanel({ child, api = null, etaEnabled = false }: { child: Child; api?: TrackingApi | null; etaEnabled?: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scope = JSON.stringify([child.studentId, child.route?.id, child.driver?.id, child.todayRun?.direction]);
  const waiting = child.todayRun?.state === "IN_PROGRESS" && child.todayRun.stopsLeft !== null;
  useEffect(() => {
    if (!api || !waiting) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const value = await api(child.studentId);
        if (active) { setState({ scope, api, value, received: performance.now(), error: null }); setElapsed(0); }
      } catch (error) {
        // Discard old coordinates on every error, including authorization loss.
        if (active) setState({ scope, api, value: null, received: performance.now(), error: error instanceof ApiError ? error.status : 0 });
      } finally {
        if (active) timer = setTimeout(() => void load(), 15_000);
      }
    };
    setState(null);
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [api, child.studentId, scope, waiting, attempt]);
  useEffect(() => {
    if (!state?.value?.position) return;
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - state.received) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [state]);
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
    {!progress && <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Planned morning pickup: {child.expectedPickupTime ?? "Not available"}. This is not a live estimate.</p>}
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
      : <><p role="status">{live ? "Live bus location" : `Last seen ${age} seconds ago. This position is stale.`}</p>
        <p className="text-sm">Location accuracy: {position.accuracyMeters} metres.</p>
        <div className={styles.map} style={{ "--parent-map-target": sizing.tapTarget } as CSSProperties}><MapView label={`Bus location for ${child.firstName} ${child.lastName}`} markers={[{ id: child.studentId, latitude: position.latitude, longitude: position.longitude, label: live ? "Current bus location" : "Last known bus location" }]} /></div>
      </>}
  </Card>;
}
