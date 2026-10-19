"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getParents, inviteParent, parentError, type Parent } from "@/lib/api/parents";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

export default function ParentsPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (error && !saving) emailRef.current?.focus(); }, [error, saving]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try { setParents(await getParents()); }
    catch (err) { setLoadError(parentError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    setNotice("");
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 255) {
      setError("Enter a valid email address (up to 255 characters).");
      emailRef.current?.focus();
      return;
    }
    setError("");
    busy.current = true;
    setSaving(true);
    try {
      const invited = await inviteParent(value);
      setNotice(`Invitation sent to ${invited.email}.`);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiValidationError ? err.errors.email || parentError(err)
        : err instanceof ApiError && err.status === 409 ? "An account with this email already exists." : parentError(err));
      emailRef.current?.focus();
    } finally { busy.current = false; setSaving(false); }
  }

  return <main className="mx-auto flex flex-col" style={{ padding: spacing.lg, gap: spacing.lg, maxWidth: sizing.pageMaxWidth, color: darkTheme.text.primary }}>
    <header><h1 className="text-2xl font-semibold">Parent Management</h1>
      <p style={{ color: darkTheme.text.secondary }}>Invite parents to set their password, then link them to students in the student editor.</p></header>
    <Card><form onSubmit={submit} noValidate className="flex flex-col" style={{ gap: spacing.md }} aria-label="Invite parent">
      <h2 className="text-lg font-semibold">Invite a parent</h2>
      <Input ref={emailRef} label="Parent email" type="email" autoComplete="email" maxLength={255} value={email} onChange={e => setEmail(e.target.value)} error={error} disabled={saving} required />
      <Button type="submit" disabled={saving}>{saving ? "Sending invitation…" : "Send invitation"}</Button>
    </form></Card>
    <p role="status" style={{ color: darkTheme.text.secondary }}>{notice}</p>
    <Card><section aria-labelledby="parents-heading" className="flex flex-col" style={{ gap: spacing.md }}>
      <h2 id="parents-heading" className="text-lg font-semibold">Parents</h2>
      {loading && <p role="status">Loading parents…</p>}
      {loadError && <div><p role="alert" style={{ color: colors.error[500] }}>{loadError}</p><Button onClick={load} disabled={loading}>Retry parent list</Button></div>}
      {!loading && !loadError && (parents.length === 0 ? <p>No parents yet. Invite a parent above to get started.</p> :
        <ul className="flex flex-col" style={{ gap: spacing.md }}>{parents.map(parent => <li key={parent.id} className="flex flex-wrap justify-between" style={{ gap: spacing.sm }}>
          <span className="break-all">{parent.email}</span><span style={{ color: darkTheme.text.secondary }}>{parent.status === "active" ? "Active" : "Invited"}</span>
        </li>)}</ul>)}
    </section></Card>
  </main>;
}
