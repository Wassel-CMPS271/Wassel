"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { radius, spacing } from "@/styles/tokens";

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

// Shown in place of the form while getSchoolTimes() is in flight. Purely
// decorative (aria-hidden) — the accessible "loading" state is the sr-only
// status text rendered alongside it in page.tsx.
export function SchoolTimesSkeleton() {
  return (
    <Card aria-hidden="true">
      <div className="flex flex-col" style={{ gap: spacing.md }}>
        <SkeletonBlock width="160px" height="24px" delay={0} />
        <div className="flex flex-col sm:flex-row" style={{ gap: spacing.md }}>
          <SkeletonBlock width="100%" height="64px" delay={0.1} />
          <SkeletonBlock width="100%" height="64px" delay={0.2} />
        </div>
        <SkeletonBlock width="96px" height="36px" delay={0.3} />
      </div>
    </Card>
  );
}
