"use client";

import { motion, useReducedMotion } from "framer-motion";
import { darkTheme, radius, spacing } from "@/styles/tokens";

const ROW_COUNT = 3;
const BLOCK_FILL = "rgba(255, 255, 255, 0.08)";

function SkeletonBlock({ width, height, delay }: { width: string; height: string; delay: number }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      style={{ width, height, borderRadius: radius.sm, backgroundColor: BLOCK_FILL }}
      animate={prefersReducedMotion ? { opacity: 0.7 } : { opacity: [0.45, 0.9, 0.45] }}
      transition={
        prefersReducedMotion
          ? { duration: 0.2 }
          : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }
      }
    />
  );
}

// Shown in place of the holiday list while getHolidays() is in flight.
// Purely decorative (aria-hidden) — the accessible "loading" state is the
// sr-only status text rendered alongside it in page.tsx.
export function HolidayListSkeleton() {
  return (
    <ul
      aria-hidden="true"
      className="flex flex-col"
      style={{ gap: spacing.sm, padding: 0, margin: 0 }}
    >
      {Array.from({ length: ROW_COUNT }).map((_, index) => (
        <li
          key={index}
          className="list-none flex items-center"
          style={{
            gap: spacing.md,
            padding: spacing.md,
            border: `1px solid ${darkTheme.surface.cardBorder}`,
            borderRadius: radius.md,
            backgroundColor: darkTheme.surface.card,
          }}
        >
          <SkeletonBlock width="52px" height="52px" delay={index * 0.15} />
          <div className="flex flex-col" style={{ gap: spacing.xs }}>
            <SkeletonBlock width="160px" height="20px" delay={index * 0.15 + 0.05} />
            <SkeletonBlock width="220px" height="14px" delay={index * 0.15 + 0.1} />
          </div>
        </li>
      ))}
    </ul>
  );
}
