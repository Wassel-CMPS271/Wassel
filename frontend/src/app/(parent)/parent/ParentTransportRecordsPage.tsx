"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { schoolToday } from "@/lib/api/absences";
import { getMyChildren, type Child } from "@/lib/api/myChildren";
import {
  addressInputErrors, listParentAddressRequests, submitParentAddressRequest,
  type AddressRequest,
} from "@/lib/api/addressRequests";
import {
  attendanceRangeErrors, getParentAttendance,
  type ParentAttendance, type AttendanceRange,
} from "@/lib/api/attendance";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

type Access = "loading" | "ready" | "expired" | "forbidden" | "missing" | "unavailable";
type Denied = (cause: unknown) => boolean;
const minTarget = { minHeight: sizing.tapTarget };
const sectionGap = { gap: spacing.md };
const zone = "Asia/Beirut";
// Fields the address form renders itself; any other key in a validation error is about the form as a whole.
const addressFieldKeys = ["address", "latitude", "longitude"];

function timestamp(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value)) : "Not recorded";
}

export function ParentTransportRecordsPage({ studentId }: { studentId: string }) {
  const [access, setAccess] = useState<Access>("loading");
  const [child, setChild] = useState<Child | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setAccess("loading");
    setChild(null);
    getMyChildren().then(children => {
      if (!active) return;
      const linked = children.find(item => item.studentId === studentId);
      if (!linked) setAccess("missing");
      else { setChild(linked); setAccess("ready"); }
    }).catch(cause => {
      if (!active) return;
      setAccess(cause instanceof ApiError && cause.status === 401 ? "expired" :
        cause instanceof ApiError && cause.status === 403 ? "forbidden" : "unavailable");
    });
    return () => { active = false; };
  }, [studentId, retry]);

  // A mid-session authorization loss immediately unmounts both data panels.
  // The backend checks ownership on every child endpoint, not the URL alone.
  const deny = useCallback<Denied>(cause => {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false;
    setChild(null);
    setAccess(cause.status === 401 ? "expired" : cause.status === 403 ? "forbidden" : "missing");
    return true;
  }, []);

  return <main className="mx-auto flex w-full min-w-0 flex-col p-4 sm:p-8" style={{
    maxWidth: sizing.pageMaxWidth, gap: spacing.lg, color: darkTheme.text.primary,
  }}>
    <Link href="/parent" className={`inline-flex w-fit items-center rounded-md text-sm underline ${focusRingClass}`}
      style={{ ...focusRingStyle, color: colors.primary[300], minHeight: sizing.tapTarget }}>Back to My children</Link>
    <h1 className="text-2xl font-semibold">Address requests &amp; attendance</h1>
    {access === "loading" && <p role="status">Loading linked child…</p>}
    {access !== "loading" && access !== "ready" && <Card className="flex flex-col items-start" style={sectionGap}>
      <p role="alert">{access === "expired" ? "Your sign-in has expired." :
        access === "forbidden" ? "You cannot view these records." :
        access === "missing" ? "This child is not linked to your account." :
        "Couldn't load your children. Please try again."}</p>
      {access === "expired" ? <Link href="/login" className={`inline-flex items-center rounded-md underline ${focusRingClass}`}
        style={{ ...focusRingStyle, color: colors.primary[300], minHeight: sizing.tapTarget }}>Sign in</Link> :
        <Button variant="secondary" style={minTarget} onClick={() => setRetry(value => value + 1)}>Retry loading child</Button>}
    </Card>}
    {access === "ready" && child && <>
      <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
        Records for {child.firstName} {child.lastName}. Only children linked to your account are available.
      </p>
      <AddressRequestsPanel key={"address-" + studentId} studentId={studentId} onAccessError={deny} />
      <AttendancePanel key={"attendance-" + studentId} studentId={studentId} onAccessError={deny} />
    </>}
  </main>;
}

function AddressRequestsPanel({ studentId, onAccessError }: { studentId: string; onAccessError: Denied }) {
  const [items, setItems] = useState<AddressRequest[] | null>(null);
  const [reload, setReload] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState({ address: "", latitude: "", longitude: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  const messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // The panel remounts per child (key), so items start null; a reload keeps the rows and the form
  // mounted instead of blanking them, which would also drop keyboard focus.
  useEffect(() => {
    let active = true;
    setLoadFailed(false); setRefreshing(true);
    listParentAddressRequests(studentId).then(rows => { if (active) { setItems(rows); setRefreshing(false); } })
      .catch(cause => {
        if (!active) return;
        setRefreshing(false);
        if (!onAccessError(cause)) setLoadFailed(true);
      });
    return () => { active = false; };
  }, [studentId, reload, onAccessError]);
  // The form is replaced by the pending notice after a successful send, so the focused button
  // unmounts; move focus to the confirmation instead of letting it fall back to the page.
  useEffect(() => { if (message) messageRef.current?.focus(); }, [message]);
  function reloadRequests() {
    if (refreshing) return;
    setError(""); setMessage(""); setFields({});
    setReload(value => value + 1);
  }

  const pending = items?.some(item => item.status === "pending") ?? false;
  async function submit() {
    if (locked.current || pending) return;
    const validation = addressInputErrors(draft);
    setFields(validation); setError(""); setMessage("");
    if (Object.keys(validation).length) return;
    locked.current = true; setBusy(true);
    try {
      const lat = draft.latitude.trim(), lng = draft.longitude.trim();
      const result = await submitParentAddressRequest(studentId, {
        address: draft.address.trim(),
        ...(lat && lng ? { latitude: Number(lat), longitude: Number(lng) } : {}),
      });
      if (!alive.current) return;
      setItems(current => [result, ...(current ?? []).filter(item => item.id !== result.id)]);
      setDraft({ address: "", latitude: "", longitude: "" });
      setMessage("Request sent to the school. The saved pickup address will not change until approved.");
    } catch (cause) {
      if (!alive.current || onAccessError(cause)) return;
      if (cause instanceof ApiValidationError) {
        // 400 puts messages on the address/pin fields; the inactive-child 409 is { studentId: message },
        // which no input renders, so show that text itself.
        const general = Object.entries(cause.errors)
          .filter(([key]) => !addressFieldKeys.includes(key)).map(([, text]) => text);
        setFields(cause.errors);
        setError(general.length ? general.join(" ") : "Check the address or optional pin below.");
      } else if (cause instanceof ApiError && cause.status === 409) {
        // The pending request may belong to another parent of this child, so it won't appear in this list.
        setError("The school already has a pending request for this child, so a new one can't be sent yet.");
      } else setError("Couldn't submit the request. Please retry.");
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }

  return <section aria-label="Pickup address requests" className="flex min-w-0 flex-col" style={sectionGap}>
    <h2 className="text-xl font-semibold">Pickup address changes</h2>
    <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
      The school decides whether to approve your request. A proposed address does not replace the saved pickup address until approval.
    </p>
    {items === null && !loadFailed && <p role="status">Loading address requests…</p>}
    {loadFailed && <Card className="flex flex-col items-start" style={sectionGap}>
      <p role="alert">Couldn&apos;t load address requests. No request has been changed.</p>
      <Button variant="secondary" style={minTarget} onClick={reloadRequests}>Retry address requests</Button>
    </Card>}
    {items && <>
      <Button variant="secondary" style={minTarget} onClick={reloadRequests} disabled={busy} aria-disabled={refreshing || undefined}>
        {refreshing ? "Refreshing…" : "Refresh request status"}
      </Button>
      {items.length === 0 ? <p>No address-change requests yet.</p> : <ul className="flex min-w-0 flex-col" style={sectionGap}>
        {items.map(item => <li key={item.id} className="min-w-0 list-none">
          <Card className="flex min-w-0 flex-col" style={{ ...sectionGap, overflowWrap: "anywhere" }}>
            <p><strong>{item.status === "pending" ? "Pending school decision" :
              item.status === "approved" ? "Approved" : "Rejected"}</strong></p>
            <p>Requested address: {item.requestedAddress}</p>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              Submitted {timestamp(item.createdAt)}
              {item.decidedAt ? " · Decided " + timestamp(item.decidedAt) : ""}
            </p>
            {item.status === "pending" && <p>The school&apos;s saved pickup details remain unchanged.</p>}
            {item.status === "approved" && <p>The school approved this request and saved the address.</p>}
            {item.status === "rejected" && <p>{item.rejectionReason ?
              "Reason: " + item.rejectionReason : "The school did not provide a reason."}</p>}
          </Card>
        </li>)}
      </ul>}
      {pending ? <p role="status">You already have a pending request for this child. You can send a new one after the school decides.</p> :
        <Card>
          <form method="post" noValidate className="flex min-w-0 flex-col" style={sectionGap}
            onSubmit={event => { event.preventDefault(); void submit(); }}>
            <h3 className="text-lg font-semibold">Request a new pickup address</h3>
            <Input label="New pickup address" maxLength={255} required disabled={busy} value={draft.address}
              style={minTarget} error={fields.address}
              onChange={event => setDraft(previous => ({ ...previous, address: event.target.value }))} />
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              Optional pin coordinates for the requested address. Enter both or leave both blank.
            </p>
            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2" style={sectionGap}>
              <Input label="Latitude (optional)" type="number" step="any" min={-90} max={90} disabled={busy}
                style={minTarget} value={draft.latitude} error={fields.latitude}
                onChange={event => setDraft(previous => ({ ...previous, latitude: event.target.value }))} />
              <Input label="Longitude (optional)" type="number" step="any" min={-180} max={180} disabled={busy}
                style={minTarget} value={draft.longitude} error={fields.longitude}
                onChange={event => setDraft(previous => ({ ...previous, longitude: event.target.value }))} />
            </div>
            <Button type="submit" disabled={busy} style={minTarget}>
              {busy ? "Submitting…" : "Submit address request"}
            </Button>
          </form>
        </Card>}
    </>}
    {error && <p role="alert" style={{ color: colors.error[500] }}>{error}</p>}
    {message && <p ref={messageRef} tabIndex={-1} role="status" className="outline-none">{message}</p>}
  </section>;
}

function defaultRange(): AttendanceRange {
  const end = schoolToday();
  const start = new Date(end + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - 6);
  return { from: start.toISOString().slice(0, 10), to: end };
}

function AttendancePanel({ studentId, onAccessError }: { studentId: string; onAccessError: Denied }) {
  const [draft, setDraft] = useState<AttendanceRange>(defaultRange);
  const [range, setRange] = useState<AttendanceRange>(defaultRange);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ParentAttendance[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setItems(null); setFailed(false);
    getParentAttendance(studentId, range).then(rows => { if (active) setItems(rows); })
      .catch(cause => { if (active && !onAccessError(cause)) setFailed(true); });
    return () => { active = false; };
  }, [studentId, range, reload, onAccessError]);
  function apply() {
    const errors = attendanceRangeErrors(draft);
    setFields(errors);
    if (Object.keys(errors).length) return;
    setRange({ ...draft });
    setReload(value => value + 1);
  }

  return <section aria-label="Attendance history" className="flex min-w-0 flex-col" style={sectionGap}>
    <h2 className="text-xl font-semibold">Recorded attendance history</h2>
    <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
      School-local run dates (Asia/Beirut). Times show when the server recorded a driver&apos;s confirmation, including offline syncs.
      Reported absences are separate from these driver records.
    </p>
    <Card>
      <form method="post" noValidate className="flex min-w-0 flex-col" style={sectionGap}
        onSubmit={event => { event.preventDefault(); apply(); }}>
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2" style={sectionGap}>
          <Input label="From date" type="date" value={draft.from} error={fields.from} style={minTarget}
            onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} />
          <Input label="To date" type="date" value={draft.to} error={fields.to} style={minTarget}
            onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} />
        </div>
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Both dates are inclusive; choose at most 62 days.</p>
        <Button type="submit" style={minTarget}>Show attendance</Button>
      </form>
    </Card>
    {items === null && !failed && <p role="status">Loading attendance…</p>}
    {failed && <Card className="flex flex-col items-start" style={sectionGap}>
      <p role="alert">Couldn&apos;t load attendance. No records have been changed.</p>
      <Button variant="secondary" style={minTarget} onClick={() => setReload(value => value + 1)}>Retry attendance</Button>
    </Card>}
    {items && <>
      <Button variant="secondary" style={minTarget} onClick={() => setReload(value => value + 1)}>Refresh attendance</Button>
      {items.length === 0 ? <p>No driver confirmations recorded for this period.</p> :
        <ul className="flex min-w-0 flex-col" style={sectionGap}>
          {items.map((item, index) => <li key={item.date + "-" + item.direction + "-" + index} className="list-none">
            <Card className="flex min-w-0 flex-col" style={sectionGap}>
              <h3 className="font-semibold">{item.date} — {item.direction === "MORNING" ? "Morning" : "Afternoon"}</h3>
              <p>{item.status === "NOT_PRESENT" ? "Not at the stop" :
                item.status === "PICKED_UP" ? "Picked up" : "Dropped off"}</p>
              {item.notPresentAt && <p className="text-sm">Not present recorded: {timestamp(item.notPresentAt)}</p>}
              {item.pickedUpAt && <p className="text-sm">Picked up recorded: {timestamp(item.pickedUpAt)}</p>}
              {item.droppedOffAt && <p className="text-sm">Dropped off recorded: {timestamp(item.droppedOffAt)}</p>}
            </Card>
          </li>)}
        </ul>}
    </>}
  </section>;
}
