"use client";

import { motion, useReducedMotion } from "framer-motion";
import { darkTheme, radius, spacing } from "@/styles/tokens";

const CARD_COUNT = 4;

function SkeletonBlock({ width, height, delay }: { width: string; height: string; delay: number }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      style={{
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: darkTheme.surface.skeleton,
      }}
      animate={prefersReducedMotion ? { opacity: 0.7 } : { opacity: [0.45, 0.9, 0.45] }}
      transition={
        prefersReducedMotion
          ? { duration: 0.2 }
          : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }
      }
    />
  );
}

// Shown while today's runs load, in the shape of the header and the stop
// cards. Purely decorative (aria-hidden): the accessible "loading" state is
// the sr-only status text rendered alongside it in page.tsx.
export function StopListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col" style={{ gap: spacing.lg }}>
      <div className="flex flex-col" style={{ gap: spacing.sm }}>
        <SkeletonBlock width="96px" height="12px" delay={0} />
        <SkeletonBlock width="200px" height="28px" delay={0.05} />
        <SkeletonBlock width="180px" height="28px" delay={0.1} />
      </div>
      <ul className="flex flex-col" style={{ gap: spacing.sm, padding: 0, margin: 0 }}>
        {Array.from({ length: CARD_COUNT }).map((_, index) => (
          <li
            key={index}
            className="list-none flex items-center"
            style={{
              gap: spacing.md,
              padding: spacing.md,
              border: `1px solid ${darkTheme.surface.cardBorder}`,
              borderRadius: radius.lg,
              backgroundColor: darkTheme.surface.card,
            }}
          >
            <SkeletonBlock width="32px" height="32px" delay={index * 0.15} />
            <div className="flex flex-col" style={{ gap: spacing.xs }}>
              <SkeletonBlock width="140px" height="18px" delay={index * 0.15 + 0.05} />
              <SkeletonBlock width="180px" height="14px" delay={index * 0.15 + 0.1} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
