"use client";

import { motion } from "framer-motion";
import type { Holiday } from "@/lib/api/holidays";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

// Holidays are plain calendar dates, not moments in time, so format them in
// UTC: local-timezone formatting could show the previous day.
function parts(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return {
    month: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    day: date.getUTCDate(),
    full: date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

// Under MotionConfig reducedMotion="user" (set in layout.tsx) the y offset is
// dropped and only the fade remains.
export function HolidayListItem({ holiday }: { holiday: Holiday }) {
  const { month, day, full } = parts(holiday.date);

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
          backgroundColor: "rgba(26, 86, 255, 0.14)",
        }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.primary[300], lineHeight: 1.1 }}
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
        <p className="text-base font-semibold truncate" style={{ color: darkTheme.text.primary }}>
          {holiday.name}
        </p>
        <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {full}
        </p>
      </div>
    </motion.li>
  );
}
