"use client";
import type { ParentInboxApi } from "@/lib/api/parentInbox";
import type { NotificationPreferencesApi } from "@/lib/api/notificationPreferences";
import { ParentHome } from "./ParentHome";
import { InboxPanel } from "./InboxPanel";
import { TrackingPanel, type TrackingApi } from "./TrackingPanel";
// Accepted Inbox is supplied by the production page. Preferences remain opt-in
// until the separate backend is merged and verified. Account changes reset both.
export function ParentInboxHome({ api = null, accountKey, preferencesApi = null, trackingApi = null, etaEnabled = false }: { api?: ParentInboxApi | null; accountKey?: string; preferencesApi?: NotificationPreferencesApi | null; trackingApi?: TrackingApi | null; etaEnabled?: boolean }) {
  return <ParentHome accountKey={accountKey} renderTracking={trackingApi ? child => <TrackingPanel child={child} api={trackingApi} etaEnabled={etaEnabled} /> : undefined} renderInbox={api ? () => <InboxPanel api={api} accountKey={accountKey} preferencesApi={preferencesApi} /> : undefined} />;
}
