"use client";
import { ParentHome } from "./ParentHome";
import { TrackingPanel, type TrackingApi } from "./TrackingPanel";
// Prepared composition only: the production page does not supply an unmerged API.
export function ParentTrackingHome({ api = null, accountKey }: { api?: TrackingApi | null; accountKey?: string }) {
  return <ParentHome accountKey={accountKey} renderTracking={api ? child => <TrackingPanel child={child} api={api} /> : undefined} />;
}
