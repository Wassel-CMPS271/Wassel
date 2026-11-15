"use client";
import { ParentHome } from "./ParentHome";
import { TrackingPanel, type TrackingApi } from "./TrackingPanel";
// Production supplies the accepted GPS/ETA client; account and child scopes stay isolated.
export function ParentTrackingHome({ api = null, accountKey, etaEnabled = false }: { api?: TrackingApi | null; accountKey?: string; etaEnabled?: boolean }) {
  return <ParentHome accountKey={accountKey} renderTracking={api ? child => <TrackingPanel child={child} api={api} etaEnabled={etaEnabled} /> : undefined} />;
}
