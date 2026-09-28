"use client";

import type { ComponentType, CSSProperties } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { DriverIcon, StudentIcon, VehicleIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

interface Feature {
  title: string;
  description: string;
  href?: string;
  cta?: string;
  Icon: ComponentType<{ size?: number }>;
}

const FEATURES: Feature[] = [
  {
    title: "Vehicles",
    description:
      "Register the buses and vans in your fleet, keep each one's seat capacity accurate, and retire vehicles that are out of service.",
    href: "/head-of-transport/vehicles",
    cta: "Open vehicles",
    Icon: VehicleIcon,
  },
  {
    title: "Drivers",
    description:
      "Keep a roster of your drivers and assign each one to the vehicle they operate.",
    href: "/head-of-transport/drivers",
    cta: "Open drivers",
    Icon: DriverIcon,
  },
  {
    title: "Students",
    description:
      "Maintain the student list and place each student on the vehicle that picks them up.",
    Icon: StudentIcon,
  },
];

// Under MotionConfig reducedMotion="user" (set in layout.tsx) the y
// offset is dropped and only the fade remains.
const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// Driven through CSS variables so Tailwind's group-hover: variants can
// swap them — inline color/background would always win over :hover.
const LIVE_CARD_VARS = {
  "--badge-bg": "rgba(26, 86, 255, 0.14)",
  "--badge-bg-hover": darkTheme.interactive.activeBg,
  "--badge-fg": colors.primary[300],
  "--badge-fg-hover": colors.accent[400],
  "--cta-fg": colors.primary[300],
  "--cta-fg-hover": colors.accent[300],
} as CSSProperties;

function IconBadge({ Icon, muted }: { Icon: Feature["Icon"]; muted?: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center transition-colors duration-150 bg-[var(--badge-bg)] group-hover:bg-[var(--badge-bg-hover)] text-[color:var(--badge-fg)] group-hover:text-[color:var(--badge-fg-hover)]"
      style={{
        width: "40px",
        height: "40px",
        borderRadius: radius.lg,
        marginBottom: spacing.md,
        ...(muted
          ? { backgroundColor: "rgba(255, 255, 255, 0.05)", color: darkTheme.text.muted }
          : {}),
      }}
    >
      <Icon size={20} />
    </span>
  );
}

export default function Page() {
  return (
    <main style={{ padding: spacing.xl, maxWidth: "1024px" }}>
      <header style={{ marginBottom: spacing.xl }}>
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.accent[300], marginBottom: spacing.xs }}
        >
          Overview
        </p>
        <h1 className="text-3xl font-semibold" style={{ color: darkTheme.text.primary }}>
          Your transport operations
        </h1>
        <p className="text-base" style={{ color: darkTheme.text.secondary, marginTop: spacing.xs }}>
          Manage your fleet, drivers, and students from one place.
        </p>
      </header>

      <motion.ul
        role="list"
        className="grid sm:grid-cols-2 lg:grid-cols-3"
        style={{ gap: spacing.md, padding: 0, margin: 0 }}
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        {FEATURES.map((feature) => {
          const { title, description, href, cta, Icon } = feature;
          return (
            <motion.li
              key={title}
              className="list-none"
              variants={itemVariants}
              whileHover={href ? { y: -3 } : undefined}
            >
              {href ? (
                <Link
                  href={href}
                  className="group block h-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ ...LIVE_CARD_VARS, outlineColor: colors.primary[400] }}
                >
                  <Card className="h-full flex flex-col">
                    <IconBadge Icon={Icon} />
                    <h2
                      className="text-lg font-semibold"
                      style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
                    >
                      {title}
                    </h2>
                    <p
                      className="text-sm flex-1"
                      style={{ color: darkTheme.text.secondary, marginBottom: spacing.md }}
                    >
                      {description}
                    </p>
                    <span className="text-sm font-medium transition-colors duration-150 text-[color:var(--cta-fg)] group-hover:text-[color:var(--cta-fg-hover)]">
                      {cta} <span aria-hidden="true">→</span>
                    </span>
                  </Card>
                </Link>
              ) : (
                <Card
                  className="h-full flex flex-col"
                  style={{
                    borderStyle: "dashed",
                    boxShadow: "none",
                    backgroundColor: "rgba(20, 22, 29, 0.5)",
                  }}
                >
                  <IconBadge Icon={Icon} muted />
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: darkTheme.text.secondary, marginBottom: spacing.xs }}
                  >
                    {title}
                  </h2>
                  <p
                    className="text-sm flex-1"
                    style={{ color: darkTheme.text.muted, marginBottom: spacing.md }}
                  >
                    {description}
                  </p>
                  <span
                    className="self-start text-xs font-medium"
                    style={{
                      padding: `2px ${spacing.sm}`,
                      borderRadius: radius.full,
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      color: darkTheme.text.muted,
                    }}
                  >
                    Coming soon
                  </span>
                </Card>
              )}
            </motion.li>
          );
        })}
      </motion.ul>
    </main>
  );
}
