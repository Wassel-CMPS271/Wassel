"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { getParents, parentError, type Parent } from "@/lib/api/parents";
import { linkStudentParent, type Student } from "@/lib/api/students";
import { colors, darkTheme, spacing } from "@/styles/tokens";

export function StudentParentForm({ student, onLinked, onBusyChange }: {
  student: Student;
  onLinked: (student: Student) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(student.parentUserId ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (error && !saving) selectRef.current?.focus(); }, [error, saving]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setParents(await getParents()); }
    catch (err) { setLoadError(parentError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const current = parents.find(parent => parent.id === student.parentUserId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    setNotice(""); setError("");
    if (!selected || !parents.some(parent => parent.id === selected)) {
      setError("Select an available parent."); return;
    }
    busy.current = true; setSaving(true); onBusyChange(true);
    try {
      const updated = await linkStudentParent(student.id, selected);
      onLinked(updated);
      setSelected(updated.parentUserId ?? "");
      setNotice("Parent relationship saved.");
    } catch (err) { setError(parentError(err)); }
    finally { busy.current = false; setSaving(false); onBusyChange(false); }
  }

  return <form onSubmit={submit} noValidate aria-label="Link parent" className="flex flex-col" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
    <h3 className="text-lg font-semibold">Parent account</h3>
    <p style={{ color: darkTheme.text.secondary }}>Current parent: {current?.email ?? (student.parentUserId ? `Unavailable account (${student.parentUserId})` : "Not assigned")}</p>
    {loading && <p role="status">Loading parents…</p>}
    {loadError && <div><p role="alert" style={{ color: colors.error[500] }}>{loadError}</p><Button type="button" onClick={load}>Retry parents</Button></div>}
    {!loading && !loadError && <>
      {parents.length === 0 ? <p>No parents available. <Link className="underline focus-visible:outline focus-visible:outline-2" style={{ color: colors.primary[300] }} href="/head-of-transport/parents">Invite a parent</Link></p> : <>
        <Select ref={selectRef} label="Parent" value={selected} onChange={e => { setSelected(e.target.value); setError(""); setNotice(""); }} disabled={saving} error={error} required>
          <option value="" disabled>Select a parent</option>
          {student.parentUserId && !current && <option value={student.parentUserId} disabled>Current account unavailable</option>}
          {parents.map(parent => <option key={parent.id} value={parent.id}>{parent.email} ({parent.status})</option>)}
        </Select>
        <Button type="submit" disabled={saving || selected === student.parentUserId}>{saving ? "Saving parent…" : "Save parent"}</Button>
      </>}
    </>}
    <p role="status" style={{ color: darkTheme.text.secondary }}>{notice}</p>
  </form>;
}
