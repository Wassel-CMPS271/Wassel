"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ROLE_HOME, me, type AuthUser, type Role } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { colors, spacing } from "@/styles/tokens";

const UserContext = createContext<AuthUser | null>(null);

export function useCurrentUser(): AuthUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser must be used inside RoleGuard");
  return user;
}

interface RoleGuardProps {
  role: Role;
  children: ReactNode;
}

// Decides which area a signed-in user sees. The backend is what protects the
// data (every endpoint checks the session and the role), so this only routes:
// the session token carries no role, so /api/auth/me is the one place to ask.
// Renders nothing until that answers.
export function RoleGuard({ role, children }: RoleGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    me()
      .then((current) => {
        if (cancelled) return;
        if (current.role === role) setUser(current);
        else router.replace(ROLE_HOME[current.role]);
      })
      .catch((error) => {
        if (cancelled) return;
        // Only a 401 means signed out. A 500 or a dropped connection must not
        // bounce a signed-in user to the login page.
        if (error instanceof ApiError && error.status === 401) router.replace("/login");
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [role, router]);

  if (failed) {
    return (
      <main style={{ padding: spacing.xl }}>
        <p role="alert" style={{ color: colors.error[500] }}>
          Couldn&apos;t reach Wassel. Refresh to try again.
        </p>
      </main>
    );
  }

  if (!user) return null;

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
