"use client";
import { useEffect, useState } from "react";
// Legacy presentation retained with its original tests/evidence. The canonical
// SCRUM-262 adapter uses LiveEtaCountdown and server secondsAway instead.
export function ArrivalCountdown({ estimate, valid = false }: { estimate: Date | null; valid?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!valid || !estimate || !Number.isFinite(estimate.getTime())) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [estimate, valid]);
  if (!valid || !estimate || !Number.isFinite(estimate.getTime())) return <p>Live arrival estimate is unavailable.</p>;
  const seconds = Math.ceil((estimate.getTime() - now) / 1000);
  // An elapsed estimate is not evidence that the bus arrived.
  if (seconds <= 0) return <p>The estimated time has passed. Waiting for an updated estimate.</p>;
  return <p role="timer" aria-label="Estimated time until arrival" aria-live="off">Estimated arrival in {Math.floor(seconds / 60)}m {seconds % 60}s</p>;
}
