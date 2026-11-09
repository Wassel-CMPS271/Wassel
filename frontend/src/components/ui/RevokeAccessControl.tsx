"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { darkTheme, spacing } from "@/styles/tokens";

interface RevokeAccessControlProps {
  /** Who the button acts on, e.g. "Ahmad Khalil" or an email. Used in the labels. */
  name: string;
  /** A short first name or the same name, used in the question. */
  shortName?: string;
  revoked: boolean;
  /** Extra sentence for the revoke question, e.g. what else happens. */
  revokeNote?: string;
  /** Reports its own failures: this control only goes back to the button once the call has finished. */
  onRevoke: () => Promise<void>;
  onRestore: () => Promise<void>;
}

// SCRUM-98. One button that reads "Revoke access" or "Restore access", and a confirmation step before either
// is sent (the same inline pattern as unassigning a vehicle): the button swaps for a question with Confirm and
// Cancel, Escape cancels, focus moves to Confirm and comes back to the button afterwards.
export function RevokeAccessControl({
  name,
  shortName,
  revoked,
  revokeNote,
  onRevoke,
  onRestore,
}: RevokeAccessControlProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const who = shortName ?? name;

  useEffect(() => {
    if (isConfirming) confirmRef.current?.focus();
  }, [isConfirming]);

  useEffect(() => {
    if (!isConfirming && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isConfirming]);

  function cancel() {
    shouldRestoreFocusRef.current = true;
    setIsConfirming(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isSaving) {
      event.preventDefault();
      cancel();
    }
  }

  async function confirm() {
    setIsSaving(true);
    try {
      await (revoked ? onRestore() : onRevoke());
    } finally {
      setIsSaving(false);
      shouldRestoreFocusRef.current = true;
      setIsConfirming(false);
    }
  }

  if (isConfirming) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center flex-wrap"
        style={{ gap: spacing.xs }}
        onKeyDown={handleKeyDown}
      >
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {revoked
            ? `Restore access for ${who}? They can sign in again.`
            : `Revoke access for ${who}? They can no longer sign in, and are signed out at their next request.${
                revokeNote ? ` ${revokeNote}` : ""
              }`}
        </span>
        <Button
          ref={confirmRef}
          variant={revoked ? "primary" : "danger"}
          onClick={confirm}
          disabled={isSaving}
          aria-label={`Confirm ${revoked ? "restore" : "revoke"} access for ${name}`}
        >
          {isSaving ? (revoked ? "Restoring..." : "Revoking...") : "Confirm"}
        </Button>
        <Button variant="ghost" onClick={cancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      ref={triggerRef}
      variant={revoked ? "secondary" : "danger"}
      onClick={() => setIsConfirming(true)}
      aria-label={`${revoked ? "Restore" : "Revoke"} access for ${name}`}
    >
      {revoked ? "Restore access" : "Revoke access"}
    </Button>
  );
}
