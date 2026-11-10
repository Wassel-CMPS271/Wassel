"use client";
import type { ParentInboxApi } from "@/lib/api/parentInbox";
import { ParentHome } from "./ParentHome";
import { InboxPanel } from "./InboxPanel";
// Prepared composition only. No unmerged inbox or invented preferences endpoint
// is enabled by the production page. Identity changes remount private UI state.
export function ParentInboxHome({ api = null, accountKey }: { api?: ParentInboxApi | null; accountKey?: string }) {
  return <ParentHome accountKey={accountKey} renderInbox={api ? () => <InboxPanel api={api} accountKey={accountKey} /> : undefined} />;
}
