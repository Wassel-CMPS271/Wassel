"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { NotificationPreferences, NotificationPreferencesApi } from "@/lib/api/notificationPreferences";
import { colors, sizing, spacing } from "@/styles/tokens";
const choices = { pickedUp: "Picked up", droppedOff: "Dropped off", notPresent: "Not at the stop", late: "Late pickup" } as const;
export function NotificationPreferencesPanel({ api = null, onAccessDenied }: { api?: NotificationPreferencesApi | null; onAccessDenied?: (status: number) => void }) {
  // Client changes discard prior choices. The parent InboxPanel account key
  // unmounts pending state, so no old response can restore private choices.
  return <PreferencesContent key={api ? "available" : "unavailable"} api={api} onAccessDenied={onAccessDenied} />;
}
function PreferencesContent({ api, onAccessDenied }: { api: NotificationPreferencesApi | null; onAccessDenied?: (status: number) => void }) {
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [source, setSource] = useState<NotificationPreferencesApi | null>(null);
  const [minutes, setMinutes] = useState("");
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [denied, setDenied] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false), [attempt, setAttempt] = useState(0);
  const generation = useRef({ active: false }), locked = useRef(false);
  const deniedCallback = useRef(onAccessDenied); deniedCallback.current = onAccessDenied;
  useEffect(() => {
    const session = { active: true }; generation.current = session;
    setDraft(null); setSource(null); setError(null); setDenied(null); setSaved(false);
    setBusy(false); locked.current = false; setLoading(false); setFieldError(undefined); setMinutes("");
    if (!api) return;
    setLoading(true);
    api.get().then(value => { if (session.active) { setDraft(value); setMinutes(String(value.lateAfterMinutes)); setSource(api); } })
      .catch(cause => { if (session.active) fail(cause); }).finally(() => { if (session.active) setLoading(false); });
    return () => { session.active = false; };
  }, [api, attempt]);
  function fail(cause: unknown) {
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) { setDenied(cause.status); setDraft(null); deniedCallback.current?.(cause.status); }
    else if (cause instanceof ApiValidationError) { setFieldError(cause.errors.lateAfterMinutes); const others = Object.entries(cause.errors).filter(([k]) => k !== "lateAfterMinutes").map(([, v]) => v); setError(others.length ? others.join(" ") : null); }
    else setError("Could not update notification preferences. Please try again.");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!api || !draft || source !== api || locked.current) return;
    const value = Number(minutes);
    setSaved(false); setError(null); setFieldError(undefined);
    if (!/^\d+$/.test(minutes) || !Number.isSafeInteger(value) || value < 5 || value > 60) { setFieldError("Choose a whole number from 5 to 60."); return; }
    const session = generation.current; locked.current = true; setBusy(true);
    try {
      const receipt = await api.save({ ...draft, lateAfterMinutes: value });
      if (session.active) { setDraft(receipt); setMinutes(String(receipt.lateAfterMinutes)); setSaved(true); }
    } catch (cause) { if (session.active) fail(cause); }
    finally { if (session.active) { locked.current = false; setBusy(false); } }
  }
  const current = source === api ? draft : null;
  return <Card className="flex min-w-0 flex-col" style={{ gap: spacing.md }}>
    <h3 className="text-lg font-semibold">Notification preferences</h3>
    {!api ? <p>Preferences and late alerts are not available yet.</p> : <>
      <p>Choices apply to future updates for all your children. Existing updates stay in your inbox.</p>
      <p>Late alerts apply to morning pickups. The school determines delays; stale GPS alone is not a late alert.</p>
      {loading && <p role="status">Loading notification preferences…</p>}
      {denied !== null ? <div role="alert"><p>{denied === 401 ? "Your sign-in has expired." : "You do not have access to these preferences."}</p>{denied === 401 && <Link href="/login" className="inline-flex items-center focus-visible:outline focus-visible:outline-2" style={{ minHeight: sizing.tapTarget, outlineColor: colors.primary[400] }}>Sign in</Link>}</div> : <>
        {error && <p role="alert" style={{ color: colors.error[500] }}>{error}</p>}
        <Button variant="secondary" disabled={busy || loading} style={{ minHeight: sizing.tapTarget }} onClick={() => setAttempt(n => n + 1)}>Reload preferences</Button>
        {current && <form noValidate onSubmit={submit} className="flex flex-col" style={{ gap: spacing.md }}>
          {Object.entries(choices).map(([key, label]) => <label key={key} className="flex items-center" style={{ gap: spacing.sm, minHeight: sizing.tapTarget }}><input type="checkbox" checked={current[key as keyof typeof choices]} disabled={busy} onChange={e => { setDraft({ ...current, [key]: e.target.checked }); setSaved(false); }} />{label}</label>)}
          <Input label="Minutes after planned pickup" type="number" min={5} max={60} step={1} value={minutes} style={{ minHeight: sizing.tapTarget }} disabled={busy} error={fieldError} onChange={e => { setMinutes(e.target.value); setSaved(false); }} />
          <p>The threshold is saved even when late alerts are turned off.</p>
          <Button type="submit" disabled={busy} style={{ minHeight: sizing.tapTarget }}>{busy ? "Saving preferences…" : "Save preferences"}</Button>
        </form>}
        {saved && <p role="status">Preferences saved.</p>}
      </>}
    </>}
  </Card>;
}
