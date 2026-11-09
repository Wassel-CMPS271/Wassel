"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { cancelAbsence, getAbsences, isSchoolDate, reportAbsence, schoolToday, type Absence } from "@/lib/api/absences";
import type { Child } from "@/lib/api/myChildren";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

// Always uses real authenticated endpoints. SCRUM-238 being unavailable is an
// error state, never a reason to substitute sample records in production.
export function AbsencesPanel({ child, onBack }: { child: Child; onBack: () => void }) {
  const [items, setItems] = useState<Absence[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [fromDate, setFrom] = useState(schoolToday);
  const [toDate, setTo] = useState(schoolToday);
  const [range, setRange] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<string | null>(null);
  const mounted = useRef(true);
  const today = schoolToday();
  const friendly = (cause: unknown) => cause instanceof ApiError && cause.status === 401
    ? "Your sign-in has expired. Sign in again."
    : cause instanceof ApiError && cause.status === 403 ? "You don't have permission to manage these absences."
      : cause instanceof ApiError && cause.status === 404 ? "This child or absence is no longer available. Refresh your children's details."
        : "Couldn't complete the request. Please try again.";

  useEffect(() => { mounted.current = true; heading.current?.focus(); return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setItems(null); setLoadError("");
    getAbsences(child.studentId).then(rows => { if (active) setItems(rows); })
      .catch(cause => { if (active) setLoadError(friendly(cause)); });
    return () => { active = false; };
  }, [child.studentId, attempt]);
  useEffect(() => {
    if (confirm) confirmButton.current?.focus();
    else if (returnFocus.current) { document.getElementById(`cancel-${returnFocus.current}`)?.focus(); returnFocus.current = null; }
  }, [confirm]);

  async function save() {
    if (locked.current) return;
    const errors: Record<string, string> = {};
    if (!isSchoolDate(fromDate) || fromDate < schoolToday()) errors.fromDate = "Choose today or a future date.";
    if (range && (!isSchoolDate(toDate) || toDate < fromDate)) errors.toDate = "Choose an end date on or after the start date.";
    setFields(errors); setError(""); setMessage("");
    if (Object.keys(errors).length) return;
    locked.current = true; setBusy(true);
    try {
      const saved = await reportAbsence(child.studentId, range ? { fromDate, toDate } : { fromDate });
      if (!mounted.current) return;
      setItems(rows => [...(rows ?? []).filter(row => row.id !== saved.id), saved].sort((a, b) => a.fromDate.localeCompare(b.fromDate)));
      setMessage("Absence reported.");
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiValidationError) {
        setFields(cause.errors);
        setError("Couldn't report the absence. Check the dates below; overlapping absences cannot be added.");
      } else setError(friendly(cause));
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }

  async function cancel(item: Absence) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await cancelAbsence(child.studentId, item.id);
      if (!mounted.current) return;
      setItems(rows => rows!.filter(row => row.id !== item.id)); setConfirm(null);
      setMessage(item.fromDate < schoolToday() ? "Upcoming days cancelled. Past absence days remain recorded." : "Absence cancelled.");
      heading.current?.focus();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof ApiValidationError
        ? Object.values(cause.errors).join(" ") : friendly(cause));
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }

  function dismiss(id: string) { returnFocus.current = id; setConfirm(null); }
  return <section aria-label={`Absences for ${child.firstName} ${child.lastName}`} className="flex min-w-0 flex-col" style={{ gap: spacing.lg, color: darkTheme.text.primary }}>
    <Button variant="secondary" disabled={busy} style={{ minHeight: sizing.tapTarget }} onClick={onBack}>Choose another child / Back to children</Button>
    <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">Absences for {child.firstName} {child.lastName}</h2>
    <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Whole school days, including morning and afternoon transport. Dates use school time (Asia/Beirut).</p>
    {loadError && <Card><p role="alert">{loadError}</p>{loadError.includes("sign-in has expired") && <Link href="/login">Sign in</Link>}<Button onClick={() => setAttempt(value => value + 1)}>Retry loading absences</Button></Card>}
    {!items && !loadError && <p role="status">Loading absences…</p>}
    {items && <>
      <Card>
        <form method="post" noValidate className="flex min-w-0 flex-col" style={{ gap: spacing.md }} onSubmit={event => { event.preventDefault(); void save(); }}>
          <h3 className="text-lg font-semibold">Report an absence</h3>
          <label className="flex items-center" style={{ gap: spacing.sm, minHeight: sizing.tapTarget }}><input type="checkbox" checked={range} disabled={busy} onChange={event => { setRange(event.target.checked); setFields({}); }} />Report a date range</label>
          <Input label={range ? "Start date" : "Absence date"} type="date" min={today} value={fromDate} disabled={busy} error={fields.fromDate} style={{ minWidth: 0, minHeight: sizing.tapTarget }} onChange={event => setFrom(event.target.value)} />
          {range && <><Input label="End date" type="date" min={fromDate > today ? fromDate : today} value={toDate} disabled={busy} error={fields.toDate} style={{ minWidth: 0, minHeight: sizing.tapTarget }} onChange={event => setTo(event.target.value)} /><p className="text-sm">Both start and end dates are included.</p></>}
          <Button type="submit" disabled={busy || confirm !== null} style={{ minHeight: sizing.tapTarget }}>{busy ? "Saving…" : "Report absence"}</Button>
        </form>
      </Card>
      {error && <p role="alert" style={{ color: colors.error[500] }}>{error} {error.includes("sign-in has expired") && <Link href="/login">Sign in</Link>}</p>}
      {message && <p role="status">{message}</p>}
      <h3 className="text-lg font-semibold">Upcoming absences</h3>
      {items.length === 0 ? <p>No upcoming absences.</p> : <ul className="flex min-w-0 flex-col" style={{ gap: spacing.md }}>
        {items.map(item => <li key={item.id} className="min-w-0 list-none"><Card className="flex min-w-0 flex-col" style={{ gap: spacing.md, overflowWrap: "anywhere" }}>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>{item.fromDate <= today ? "Ongoing absence" : "Upcoming absence"}</p>
          <p>{item.fromDate === item.toDate ? item.fromDate : `${item.fromDate} to ${item.toDate} (inclusive)`}</p>
          {confirm === item.id ? <div role="group" aria-label={`Confirm cancellation ${item.id}`} onKeyDown={event => { if (event.key === "Escape" && !busy) dismiss(item.id); }} className="flex flex-col" style={{ gap: spacing.sm }}>
            <p>Cancel this absence? {item.fromDate < today ? "Only today and future days will be cancelled; past days remain recorded." : "Your child will no longer be marked absent for these days."}</p>
            <Button ref={confirmButton} disabled={busy} style={{ minHeight: sizing.tapTarget }} onClick={() => void cancel(item)}>Confirm cancellation</Button>
            <Button variant="secondary" disabled={busy} style={{ minHeight: sizing.tapTarget }} onClick={() => dismiss(item.id)}>Keep absence</Button>
          </div> : <Button id={`cancel-${item.id}`} variant="secondary" disabled={busy || confirm !== null} style={{ minHeight: sizing.tapTarget }} onClick={() => { setConfirm(item.id); setError(""); setMessage(""); }}>Cancel absence</Button>}
        </Card></li>)}
      </ul>}
    </>}
  </section>;
}
