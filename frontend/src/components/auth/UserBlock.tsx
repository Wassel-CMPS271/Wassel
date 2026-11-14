"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/Button";
import { logout, type Role } from "@/lib/api/auth";
import { colors, darkTheme, spacing } from "@/styles/tokens";

const ROLE_LABEL: Record<Role, string> = {
  DRIVER: "Driver",
  PARENT: "Parent",
  HEAD_OF_TRANSPORT: "Head of Transport",
  ADMIN: "Admin",
};

export interface UserBlockProps {
  // Checked right before signing out; a non-null return is shown as a question
  // (Confirm/Cancel, the same inline pattern as RevokeAccessControl) instead of
  // signing out at once. A role with nothing to warn about (most of them) never
  // passes this. SCRUM-273: the driver layout uses it to warn about confirmations
  // not yet sent.
  confirmSignOut?: () => string | null;
}

// The signed-in user and the sign out button. The layouts put it in their own
// bottom-of-sidebar container. The API sends no name yet, so it shows the email.
export function UserBlock({ confirmSignOut }: UserBlockProps = {}) {
  const router = useRouter();
  const user = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!confirming && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  async function signOut() {
    setSignOutFailed(false);
    setIsSigningOut(true);
    try {
      await logout();
      router.replace("/login");
    } catch {
      setSignOutFailed(true);
      setIsSigningOut(false);
    }
  }

  function handleSignOutClick() {
    const warning = confirmSignOut?.();
    if (warning) setConfirming(warning);
    else void signOut();
  }

  function cancelConfirm() {
    restoreFocusRef.current = true;
    setConfirming(null);
  }

  function confirmSignOutNow() {
    restoreFocusRef.current = true;
    setConfirming(null);
    void signOut();
  }

  return (
    <>
      <div className="flex items-center" style={{ gap: spacing.sm }}>
        <div
          aria-hidden="true"
          className="flex items-center justify-center flex-shrink-0 rounded-full font-semibold text-sm"
          style={{
            width: "34px",
            height: "34px",
            backgroundColor: "rgba(26, 86, 255, 0.2)",
            border: `1px solid ${darkTheme.surface.inputBorder}`,
            color: colors.primary[300],
          }}
        >
          {user.email.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: darkTheme.text.primary }}>
            {user.email}
          </div>
          <div className="text-xs truncate" style={{ color: darkTheme.text.muted }}>
            {ROLE_LABEL[user.role]}
          </div>
        </div>
      </div>

      {confirming ? (
        <div
          role="group"
          aria-label="Confirm sign out"
          className="flex flex-col items-start"
          style={{ gap: spacing.sm, marginTop: spacing.md }}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancelConfirm();
          }}
        >
          <p className="text-sm" style={{ color: darkTheme.text.primary }}>
            {confirming}
          </p>
          <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
            <Button ref={confirmRef} variant="danger" onClick={confirmSignOutNow}>
              Sign out anyway
            </Button>
            <Button variant="ghost" onClick={cancelConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={triggerRef}
          variant="ghost"
          onClick={handleSignOutClick}
          disabled={isSigningOut}
          className="w-full"
          style={{ marginTop: spacing.md }}
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </Button>
      )}
      {signOutFailed && (
        <p role="alert" className="text-sm" style={{ marginTop: spacing.sm, color: colors.error[500] }}>
          Couldn&apos;t sign out. Please try again.
        </p>
      )}
    </>
  );
}
