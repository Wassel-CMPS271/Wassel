"use client";

import { useState, type ComponentType, type MouseEvent } from "react";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { RoleGuard, useCurrentUser } from "@/components/auth/RoleGuard";
import { UserBlock } from "@/components/auth/UserBlock";
import { BrandMark } from "@/components/ui/BrandMark";
import {
  StudentIcon,
  VehicleIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import {
  colors,
  darkPageBackground,
  darkTheme,
  radius,
  sizing,
  spacing,
} from "@/styles/tokens";

interface NavItem {
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "My children", Icon: StudentIcon },
  { label: "School route", Icon: VehicleIcon },
  { label: "Profile", Icon: SettingsIcon },
];

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard role="PARENT">
      <ParentShell>{children}</ParentShell>
    </RoleGuard>
  );
}

function ParentShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const [homeVersion, setHomeVersion] = useState(0);
  function resetHome(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setHomeVersion(value => value + 1);
  }
  return (
    <MotionConfig reducedMotion="user">
      <div
        className="flex flex-col md:flex-row min-h-screen"
        style={{
          background: darkPageBackground,
          color: darkTheme.text.primary,
        }}
      >
        <aside
          className="flex flex-col flex-shrink-0 w-full md:w-64 md:h-screen md:sticky md:top-0 border-b md:border-b-0 md:border-r"
          style={{
            borderColor: darkTheme.surface.cardBorder,
            backgroundColor: darkTheme.surface.sidebar,
            backdropFilter: "blur(12px)",
            padding: spacing.lg,
          }}
        >
          <Link
            href="/parent"
            onClick={resetHome}
            className="flex items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{
              gap: spacing.sm,
              marginBottom: spacing.xl,
              outlineColor: colors.primary[400],
            }}
          >
            <BrandMark size={sizing.brandSidebar} />

            <span className="flex flex-col">
              <span
                className="text-xl font-bold"
                style={{
                  color: darkTheme.text.primary,
                  letterSpacing: "0.02em",
                  lineHeight: 1.1,
                }}
              >
                Wassel
              </span>

              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: colors.accent[300] }}
              >
                Parent
              </span>
            </span>
          </Link>

          <nav
            aria-label="Parent navigation"
            className="flex flex-col"
            style={{ gap: spacing.xs }}
          >
            {NAV_ITEMS.map(({ label, Icon }) => label === "My children" ? (
              <Link key={label} href="/parent" onClick={resetHome} className="flex items-center text-sm rounded-md focus-visible:outline focus-visible:outline-2" style={{ gap: spacing.sm, padding: `${spacing.sm} ${spacing.md}`, minHeight: sizing.tapTarget, color: colors.primary[300], outlineColor: colors.primary[400] }}><Icon /><span>{label}</span></Link>
            ) : (
              <span
                key={label}
                aria-disabled="true"
                title="Coming soon"
                className="flex items-center text-sm"
                style={{
                  gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.md}`,
                  borderRadius: radius.md,
                  color: darkTheme.text.muted,
                  cursor: "not-allowed",
                }}
              >
                <Icon />

                <span className="flex-1">{label}</span>

                <span
                  className="text-xs font-medium"
                  style={{
                    padding: `2px ${spacing.sm}`,
                    borderRadius: radius.full,
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    color: darkTheme.text.muted,
                  }}
                >
                  Soon
                </span>
              </span>
            ))}
          </nav>

          <div
            className="mt-6 md:mt-auto"
            style={{
              paddingTop: spacing.lg,
              borderTop: `1px solid ${darkTheme.surface.cardBorder}`,
            }}
          >
            <UserBlock />
          </div>
        </aside>

        <div key={`${user.schoolId}:${user.id}:${homeVersion}`} className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </MotionConfig>
  );
}