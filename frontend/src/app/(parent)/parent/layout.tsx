"use client";

import { MotionConfig } from "framer-motion";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { UserBlock } from "@/components/auth/UserBlock";
import { darkPageBackground, darkTheme, spacing } from "@/styles/tokens";

// The parent area has no screens yet, so this is only the guard, the page
// background and the signed-in user with sign out. Its sidebar arrives with the area.
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="PARENT">
      <MotionConfig reducedMotion="user">
        <div
          className="min-h-screen"
          style={{ background: darkPageBackground, color: darkTheme.text.primary }}
        >
          <header className="max-w-xs" style={{ padding: spacing.lg }}>
            <UserBlock />
          </header>
          <div>{children}</div>
        </div>
      </MotionConfig>
    </RoleGuard>
  );
}
