"use client";
import type { ArrivalEstimate } from "@/lib/api/parentTracking";
// secondsAway is the server's duration. Device wall-clock skew must not change it.
export function LiveEtaCountdown({ estimate, elapsedSeconds }: { estimate: ArrivalEstimate | null; elapsedSeconds: number }) {
  if (!estimate || typeof estimate.arrivesAt !== "string" || !Number.isFinite(Date.parse(estimate.arrivesAt))
    || !Number.isSafeInteger(estimate.secondsAway) || estimate.secondsAway < 0 || !Number.isFinite(elapsedSeconds)) {
    return <p>Live arrival estimate is unavailable.</p>;
  }
  const remaining = Math.max(0, estimate.secondsAway - Math.max(0, Math.floor(elapsedSeconds)));
  return <div>
    <p role="timer" aria-label="Estimated time until arrival" aria-live="off">{remaining > 0 ? `Estimated arrival in ${Math.floor(remaining / 60)}m ${remaining % 60}s` : "Bus is due. Waiting for confirmation or an updated estimate."}</p>
    <p className="text-sm">Estimated arrival: <time dateTime={estimate.arrivesAt}>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", hour: "2-digit", minute: "2-digit" }).format(new Date(estimate.arrivesAt))}</time> (school time). This is an estimate.</p>
  </div>;
}
