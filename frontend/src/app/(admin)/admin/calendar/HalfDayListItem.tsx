"use client";

import { motion } from "framer-motion";
import type { HalfDay } from "@/lib/api/halfDays";
import { calendarDateParts } from "@/lib/calendarDate";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

// Under MotionConfig reducedMotion="user" (set in layout.tsx) the y offset is
// dropped and only the fade remains.
export function HalfDayListItem({ halfDay }: { halfDay: HalfDay }) {
  const { month, day, full } = calendarDateParts(halfDay.date);

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="list-none flex items-center"
      style={{
        gap: spacing.md,
        padding: spacing.md,
        border: `1px solid ${darkTheme.surface.cardBorder}`,
        borderRadius: radius.md,
        backgroundColor: darkTheme.surface.card,
      }}
    >
      <span
        aria-hidden="true"
        className="flex flex-col items-center justify-center flex-shrink-0"
        style={{
          width: "52px",
          height: "52px",
          borderRadius: radius.md,
          backgroundColor: "rgba(100, 64, 255, 0.16)",
        }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.secondary[300], lineHeight: 1.1 }}
        >
          {month}
        </span>
        <span
          className="text-lg font-semibold"
          style={{ color: darkTheme.text.primary, lineHeight: 1.1 }}
        >
          {day}
        </span>
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold" style={{ color: darkTheme.text.primary }}>
          Half-day
        </p>
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {full}
        </p>
      </div>
    </motion.li>
  );
}
