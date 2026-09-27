"use client";

import type { ComponentType, CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig, motion } from "framer-motion";
import { DriverIcon, SettingsIcon, StudentIcon, VehicleIcon } from "@/components/ui/icons";
import { colors, darkPageBackground, darkTheme, radius, spacing } from "@/styles/tokens";

interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
  Icon: ComponentType<{ size?: number }>;
}

// Drivers/Students arrive in SCRUM-159–162; Settings has no ticket yet.
const NAV_ITEMS: NavItem[] = [
  { label: "Vehicles", href: "/head-of-transport/vehicles", enabled: true, Icon: VehicleIcon },
  { label: "Drivers", href: "/head-of-transport/drivers", enabled: false, Icon: DriverIcon },
  { label: "Students", href: "/head-of-transport/students", enabled: false, Icon: StudentIcon },
  { label: "Settings", href: "/head-of-transport/settings", enabled: false, Icon: SettingsIcon },
];

// Placeholder until SCRUM-176 (real auth) lands.
const CURRENT_USER = { name: "Rana Haddad", role: "Head of Transport", initial: "R" };

// Colors go through CSS variables so Tailwind's hover: variants can
// override them — inline color/background would always win over :hover.
function navLinkVars(isActive: boolean): CSSProperties {
  return {
    "--nav-fg": isActive ? colors.accent[300] : darkTheme.text.secondary,
    "--nav-fg-hover": isActive ? colors.accent[300] : darkTheme.text.primary,
    "--nav-bg": isActive ? darkTheme.interactive.activeBg : "transparent",
    "--nav-bg-hover": isActive ? darkTheme.interactive.activeBg : darkTheme.interactive.hoverBg,
    "--nav-icon": isActive ? colors.accent[400] : darkTheme.text.muted,
    "--nav-icon-hover": colors.accent[400],
  } as CSSProperties;
}

export default function HeadOfTransportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
            href="/head-of-transport"
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
                Head of Transport
              </span>
            </span>
          </Link>

          <nav
            aria-label="Head of transport navigation"
            className="flex flex-col"
            style={{ gap: spacing.xs }}
          >
            {NAV_ITEMS.map(({ label, href, enabled, Icon }) => {
              if (!enabled) {
                return (
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
                );
              }

              const isActive = pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <Link
                  key={label}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className="group relative flex items-center text-sm font-medium transition-colors duration-150 bg-[var(--nav-bg)] hover:bg-[var(--nav-bg-hover)] text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    ...navLinkVars(isActive),
                    gap: spacing.sm,
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderRadius: radius.md,
                    outlineColor: colors.primary[400],
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-indicator"
                      aria-hidden="true"
                      className="absolute"
                      style={{
                        left: 0,
                        top: "6px",
                        bottom: "6px",
                        width: "3px",
                        borderRadius: radius.full,
                        backgroundColor: colors.accent[400],
                        boxShadow: "0 0 8px rgba(251, 191, 36, 0.6)",
                      }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                  <span className="flex text-[color:var(--nav-icon)] group-hover:text-[color:var(--nav-icon-hover)] transition-colors duration-150">
                    <Icon />
                  </span>
                  {label}
                </Link>
              );
            })}
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
