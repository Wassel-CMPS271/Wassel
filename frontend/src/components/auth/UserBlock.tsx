"use client";

import { useState } from "react";
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

// The signed-in user and the sign out button. The layouts put it in their own
// bottom-of-sidebar container. The API sends no name yet, so it shows the email.
export function UserBlock() {
  const router = useRouter();
  const user = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  async function handleSignOut() {
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

      <Button
        variant="ghost"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="w-full"
        style={{ marginTop: spacing.md }}
      >
        {isSigningOut ? "Signing out..." : "Sign out"}
      </Button>
      {signOutFailed && (
        <p role="alert" className="text-sm" style={{ marginTop: spacing.sm, color: colors.error[500] }}>
          Couldn&apos;t sign out. Please try again.
        </p>
      )}
    </>
  );
}
