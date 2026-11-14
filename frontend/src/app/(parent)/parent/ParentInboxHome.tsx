"use client";
import type { ParentInboxApi } from "@/lib/api/parentInbox";
import type { NotificationPreferencesApi } from "@/lib/api/notificationPreferences";
import { ParentHome } from "./ParentHome";
import { InboxPanel } from "./InboxPanel";
// Accepted Inbox is supplied by the production page. Preferences remain opt-in
// until the separate backend is merged and verified. Account changes reset both.
export function ParentInboxHome({ api = null, accountKey, preferencesApi = null }: { api?: ParentInboxApi | null; accountKey?: string; preferencesApi?: NotificationPreferencesApi | null }) {
  return <ParentHome accountKey={accountKey} renderInbox={api ? () => <InboxPanel api={api} accountKey={accountKey} preferencesApi={preferencesApi} /> : undefined} />;
}
