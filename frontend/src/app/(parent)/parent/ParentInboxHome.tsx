"use client";
import type { ParentInboxApi } from "@/lib/api/parentInbox";
import type { NotificationPreferencesApi } from "@/lib/api/notificationPreferences";
import { ParentHome } from "./ParentHome";
import { InboxPanel } from "./InboxPanel";
import { TrackingPanel, type TrackingApi } from "./TrackingPanel";
// The authenticated page supplies accepted Inbox/preferences and GPS/ETA clients.
// Account changes reset every panel; isolated compositions can omit a client.
export function ParentInboxHome({ api = null, accountKey, preferencesApi = null, trackingApi = null, etaEnabled = false }: { api?: ParentInboxApi | null; accountKey?: string; preferencesApi?: NotificationPreferencesApi | null; trackingApi?: TrackingApi | null; etaEnabled?: boolean }) {
  return <ParentHome accountKey={accountKey} renderTracking={trackingApi ? child => <TrackingPanel child={child} api={trackingApi} etaEnabled={etaEnabled} /> : undefined} renderInbox={api ? () => <InboxPanel api={api} accountKey={accountKey} preferencesApi={preferencesApi} /> : undefined} />;
}
