"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { ButtonVariant } from "@/components/ui/Button";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { setStudentStatus } from "@/lib/api/roster";
import type { Student, StudentStatus } from "@/lib/api/students";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

interface StudentStatusControlProps {
  student: Student;
  /** Called with the student the server sent back, so the row can update without a reload. */
  onChanged: (student: Student) => void;
}

type ActionKind = "pause" | "archive" | "resume" | "restore";

interface Action {
  kind: ActionKind;
  target: StudentStatus;
  label: string;
  variant: ButtonVariant;
  // Pause and archive take the student off their route, so they ask first.
  needsConfirm: boolean;
  progress: string;
}

const PAUSE: Action = { kind: "pause", target: "paused", label: "Pause", variant: "secondary", needsConfirm: true, progress: "Pausing" };
const ARCHIVE: Action = { kind: "archive", target: "inactive", label: "Archive", variant: "danger", needsConfirm: true, progress: "Archiving" };
const RESUME: Action = { kind: "resume", target: "active", label: "Resume", variant: "primary", needsConfirm: false, progress: "Resuming" };
const RESTORE: Action = { kind: "restore", target: "active", label: "Restore", variant: "primary", needsConfirm: false, progress: "Restoring" };

// docs/contracts/roster.md: archived can only go back to active (archived to
// paused is a 409), so an archived student never gets a Pause button.
const ACTIONS: Record<StudentStatus, Action[]> = {
  active: [PAUSE, ARCHIVE],
  paused: [RESUME, ARCHIVE],
  inactive: [RESTORE],
};

function confirmQuestion(action: Action, name: string): string {
  const what = action.kind === "pause" ? `Pause ${name}?` : `Archive ${name}?`;
  return `${what} They are taken off their route now and their seat is freed. Past runs, confirmations and attendance are kept. If they go back to active, they are on no route until you place them on one.`;
}

function successMessage(action: Action, name: string): string {
  if (action.kind === "pause") return `${name} is paused and off their route.`;
  if (action.kind === "archive") return `${name} is archived and off their route.`;
  return `${name} is active again. They are on no route yet.`;
}

function statusErrorMessage(err: unknown): string {
  if (err instanceof ApiValidationError) {
    return err.errors.status || Object.values(err.errors).join(" ") || "The status was rejected. Please try again.";
  }
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session has expired. Please sign in again.";
    if (err.status === 403) return "You do not have permission to change this student's status.";
    if (err.status === 404) return "This student could not be found. They may have been removed; refresh the list.";
    // Every 409 detail is a user-ready sentence ("<Name> is on <route> ... Move them after the run ends.").
    if (err.status === 409 && err.message !== "Request failed") return err.message;
  }
  return "Something went wrong. Please try again.";
}

// SCRUM-287. The status buttons of one student: Active shows Pause and
// Archive, Paused shows Resume and Archive, Archived shows Restore. Pause and
// Archive ask first, with the RevokeAccessControl pattern (the buttons swap
// for a question with Confirm and Cancel, Escape cancels, focus goes to
// Confirm and back to the button). A refused change leaves the student as
// they were: the row only changes when onChanged hands it the server's answer.
export function StudentStatusControl({ student, onChanged }: StudentStatusControlProps) {
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // State updates land after the click handler, so a second click in the same
  // tick would still see the buttons enabled: this ref is the real guard.
  const inFlightRef = useRef(false);
  const triggerRefs = useRef<Partial<Record<ActionKind, HTMLButtonElement | null>>>({});
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Which button gets focus once the buttons are back: the one that was used,
  // or, after a success, the first button of the new status's set once the
  // parent has handed it back (the old set's buttons are about to go).
  const focusAfterRef = useRef<{ kind: ActionKind } | { status: StudentStatus } | null>(null);
  const questionId = useId();
  const errorId = useId();
  const name = `${student.firstName} ${student.lastName}`;
  const actions = ACTIONS[student.status] ?? [];

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    const target = focusAfterRef.current;
    if (confirming || pending || target === null) return;
    if ("status" in target && target.status !== student.status) return;
    const first = ACTIONS[student.status]?.[0];
    const byKind = "kind" in target ? triggerRefs.current[target.kind] : undefined;
    const button = byKind ?? (first ? triggerRefs.current[first.kind] : undefined);
    if (button) {
      focusAfterRef.current = null;
      button.focus();
    }
  }, [confirming, pending, student.status]);

  function cancel() {
    if (!confirming) return;
    focusAfterRef.current = { kind: confirming.kind };
    setConfirming(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      cancel();
    }
  }

  function choose(action: Action) {
    if (inFlightRef.current) return;
    setError("");
    setNotice("");
    if (action.needsConfirm) {
      setConfirming(action);
      return;
    }
    void submit(action);
  }

  async function submit(action: Action) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError("");
    setPending(action);
    setNotice(`${action.progress} ${name}…`);
    try {
      const updated = await setStudentStatus(student.id, action.target);
      setNotice(successMessage(action, name));
      focusAfterRef.current = { status: updated.status };
      onChanged(updated);
    } catch (err) {
      setNotice("");
      setError(statusErrorMessage(err));
      focusAfterRef.current = { kind: action.kind };
    } finally {
      inFlightRef.current = false;
      setPending(null);
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: spacing.xs }}>
      {confirming ? (
        <div className="flex flex-col" style={{ gap: spacing.sm }} onKeyDown={handleKeyDown}>
          <p id={questionId} className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {confirmQuestion(confirming, name)}
          </p>
          <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
            <Button
              ref={confirmRef}
              variant="danger"
              onClick={() => submit(confirming)}
              disabled={pending !== null}
              aria-label={`Confirm ${confirming.kind} ${name}`}
              aria-describedby={questionId}
              style={{ minHeight: sizing.tapTarget }}
            >
              {pending ? `${pending.progress}…` : `Confirm ${confirming.kind}`}
            </Button>
            <Button variant="ghost" onClick={cancel} disabled={pending !== null} style={{ minHeight: sizing.tapTarget }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap" style={{ gap: spacing.sm }}>
          {actions.map((action) => (
            <Button
              key={action.kind}
              ref={(element) => {
                triggerRefs.current[action.kind] = element;
              }}
              variant={action.variant}
              onClick={() => choose(action)}
              disabled={pending !== null}
              aria-label={`${action.label} ${name}`}
              aria-describedby={error ? errorId : undefined}
              style={{ minHeight: sizing.tapTarget }}
            >
              {pending?.kind === action.kind ? `${action.progress}…` : action.label}
            </Button>
          ))}
        </div>
      )}

      {/* Always mounted, so progress and success are announced when the text changes. */}
      <p role="status" className="text-xs" style={{ color: darkTheme.text.secondary }}>
        {notice}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-sm" style={{ color: colors.error[500] }}>
          {error}
        </p>
      )}
    </div>
  );
}
