"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApiError } from "@/lib/api/errors";
import type { InboxEvent, ParentInboxApi } from "@/lib/api/parentInbox";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

const wording = { PICKED_UP: "Picked up", DROPPED_OFF: "Dropped off", NOT_PRESENT: "Not at the stop" };
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
// Deliberately unmounted until #146 merges. api=null never substitutes fixtures.
// Only backend read receipts are applied; this UI never creates business events.
export function InboxPanel({ api = null, accountKey = "current-parent" }: { api?: ParentInboxApi | null; accountKey?: string }) {
  return <InboxContent key={accountKey} api={api} />;
}
function InboxContent({ api }: { api: ParentInboxApi | null }) {
  const [data, setData] = useState<{ source: ParentInboxApi; rows: InboxEvent[]; count: number } | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const locked = useRef(false);
  const generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const id = ++generation.current;
    let active = true;
    if (!api) { setData(null); setError(null); setLoading(false); return; }
    setData(null); setError(null); setLoading(true);
    Promise.all([api.list(unreadOnly), api.unreadCount()]).then(([rows, count]) => {
      if (active && mounted.current && generation.current === id) setData({ source: api, rows, count });
    }).catch(cause => { if (active && mounted.current && generation.current === id) setError(cause instanceof ApiError ? cause.status : 0); })
      .finally(() => { if (active && mounted.current && generation.current === id) setLoading(false); });
    return () => { active = false; };
  }, [api, unreadOnly, attempt]);
  async function mark(id?: string) {
    if (!api || locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    const current = generation.current;
    try {
      if (id) await api.markRead(id); else await api.markAllRead();
      // The count is authoritative across all entries, not derived from the
      // newest-50 list, and can change from another tab during the mutation.
      if (!mounted.current || current !== generation.current) return;
      const [rows, count] = await Promise.all([api.list(unreadOnly), api.unreadCount()]);
      if (mounted.current && current === generation.current) setData({ source: api, rows, count });
    } catch (cause) {
      if (mounted.current && current === generation.current) {
        const status = cause instanceof ApiError ? cause.status : 0;
        setError(status);
        if ([401, 403].includes(status)) setData(null);
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const visible = data?.source === api ? data : null;
  return <section aria-label="Parent inbox" className="flex min-w-0 flex-col" style={{ gap: spacing.md, overflowWrap: "anywhere" }}>
    <h2 className="text-xl font-semibold">Transport updates</h2>
    <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Times shown in school time (Asia/Beirut).</p>
    <p className="text-sm" style={{ color: darkTheme.text.secondary }}>The recent inbox shows up to 50 updates. The unread total and Mark all as read cover all your children and older updates.</p>
    {!api ? <p role="status">Inbox is not available yet.</p> : <>
      <label className="flex items-center" style={{ gap: spacing.sm, minHeight: sizing.tapTarget }}><input type="checkbox" checked={unreadOnly} disabled={busy} onChange={e => setUnreadOnly(e.target.checked)} />Unread only</label>
      <Button variant="secondary" disabled={busy || loading} style={{ minHeight: sizing.tapTarget }} onClick={() => setAttempt(n => n + 1)}>Refresh inbox</Button>
      {loading && <p role="status">Loading inbox…</p>}
      {error !== null && <div role="alert" style={{ color: colors.error[500] }}><p>{error === 401 ? "Your sign-in has expired." : error === 403 ? "You do not have access to this inbox." : "Could not update the inbox. Please refresh and try again."}</p>{error === 401 && <Link href="/login" className="inline-flex items-center focus-visible:outline focus-visible:outline-2" style={{ minHeight: sizing.tapTarget, outlineColor: colors.primary[400] }}>Sign in</Link>}</div>}
      {visible && <>
        <p role="status">{visible.count} unread updates</p>
        <Button disabled={busy || visible.count === 0} style={{ minHeight: sizing.tapTarget }} onClick={() => void mark()}>Mark all as read</Button>
        {visible.rows.length === 0 ? <p>{unreadOnly ? "No unread updates." : "No transport updates yet."}</p>
          : <ul className="flex min-w-0 flex-col" style={{ gap: spacing.md }}>{visible.rows.map(row => <li key={row.id} className="min-w-0 list-none"><Card className="flex min-w-0 flex-col" style={{ gap: spacing.sm }}>
            <h3 className="text-lg font-semibold">{row.studentName}: {wording[row.type]}</h3>
            <p>{row.direction === "MORNING" ? "Morning run" : "Afternoon run"} · <time dateTime={row.createdAt}>{time(row.createdAt)}</time></p>
            <p>{row.readAt === null ? "Unread" : "Read"}</p>
            {row.readAt === null && <Button variant="secondary" disabled={busy} style={{ minHeight: sizing.tapTarget }} onClick={() => void mark(row.id)} aria-label={`Mark update for ${row.studentName} as read`}>Mark as read</Button>}
          </Card></li>)}</ul>}
      </>}
    </>}
    <Card><h3 className="text-lg font-semibold">Notification preferences</h3><p>Preferences and late alerts are not available yet.</p></Card>
  </section>;
}
