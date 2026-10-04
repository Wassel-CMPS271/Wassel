"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { DriverIcon, StudentIcon, VehicleIcon } from "@/components/ui/icons";
import { colors, darkPageBackground, darkTheme, radius, spacing } from "@/styles/tokens";

interface NavItem {
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

// Driver features arrive in Sprint 2. Until then every destination is a disabled
// "Soon" item, so there are no live links to dead pages.
const NAV_ITEMS: NavItem[] = [
  { label: "My route", Icon: VehicleIcon },
  { label: "Students", Icon: StudentIcon },
  { label: "Profile", Icon: DriverIcon },
];

// Placeholder until SCRUM-176 (real auth) lands.
const CURRENT_USER = { name: "Driver", role: "Driver", initial: "D" };

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        className="flex flex-col md:flex-row min-h-screen"
        style={{ background: darkPageBackground, color: darkTheme.text.primary }}
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
            href="/driver"
            className="flex items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{ gap: spacing.sm, marginBottom: spacing.xl, outlineColor: colors.primary[400] }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center flex-shrink-0 font-bold"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: radius.lg,
                background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.secondary[500]})`,
                boxShadow: "0 6px 20px rgba(26, 86, 255, 0.35)",
                color: "#ffffff",
                fontSize: "20px",
              }}
            >
              W
            </span>
            <span className="flex flex-col">
              <span
                className="text-xl font-bold"
                style={{ color: darkTheme.text.primary, letterSpacing: "0.02em", lineHeight: 1.1 }}
              >
                Wassel
              </span>
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: colors.accent[300] }}
              >
                Driver
              </span>
            </span>
          </Link>

          <nav aria-label="Driver navigation" className="flex flex-col" style={{ gap: spacing.xs }}>
            {NAV_ITEMS.map(({ label, Icon }) => (
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
                {CURRENT_USER.initial}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: darkTheme.text.primary }}
                >
                  {CURRENT_USER.name}
                </div>
                <div className="text-xs truncate" style={{ color: darkTheme.text.muted }}>
                  {CURRENT_USER.role}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </MotionConfig>
  );
}
