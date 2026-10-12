"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { Student } from "@/lib/api/students";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";
import { EditStudentForm } from "./EditStudentForm";

interface StudentListItemProps {
  student: Student;
  onEdit: (
    id: string,
    updates: Partial<Omit<Student, "id" | "createdAt">>,
  ) => Promise<void>;
  onToggleStatus: (id: string, status: Student["status"]) => Promise<void>;
}

const GLOW_REST = "0 0 0px 0px rgba(18, 183, 106, 0)";
const GLOW_PEAK = "0 0 12px 4px rgba(18, 183, 106, 0.55)";
const GLOW_STATIC = "0 0 8px 2px rgba(18, 183, 106, 0.45)";

export function StudentListItem({ student, onEdit, onToggleStatus }: StudentListItemProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const isActive = student.status === "active";

  async function handleToggleStatus() {
    setIsTogglingStatus(true);
    try {
      await onToggleStatus(student.id, isActive ? "inactive" : "active");
    } finally {
      setIsTogglingStatus(false);
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="list-none flex flex-col sm:flex-row sm:items-center sm:justify-between"
      style={{
        gap: spacing.md,
        padding: spacing.md,
        border: `1px solid ${isActive ? darkTheme.surface.cardBorder : "rgba(255, 255, 255, 0.05)"}`,
        borderRadius: radius.md,
        backgroundColor: isActive ? darkTheme.surface.card : "rgba(255, 255, 255, 0.03)",
        boxShadow: isActive ? darkTheme.surface.cardShadow : "none",
      }}
    >
      <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
        <span className="text-base font-medium" style={{ color: darkTheme.text.primary }}>
          {student.firstName} {student.lastName}
        </span>
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {student.grade}
        </span>
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          Guardian: {student.guardianName} · {student.guardianPhone}
        </span>
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
        <div className="flex items-center" style={{ gap: spacing.xs }}>
          <motion.span
            aria-hidden="true"
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: "10px", height: "10px" }}
            animate={{
              backgroundColor: isActive ? darkTheme.status.activeDot : darkTheme.status.inactiveDot,
              scale: isActive && !prefersReducedMotion ? [1, 1.4, 1] : 1,
              boxShadow: isActive
                ? prefersReducedMotion
                  ? GLOW_STATIC
                  : [GLOW_REST, GLOW_PEAK, GLOW_REST]
                : GLOW_REST,
            }}
            transition={
              isActive && !prefersReducedMotion
                ? {
                    backgroundColor: { duration: 0.3 },
                    scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                    boxShadow: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                  }
                : { backgroundColor: { duration: 0.3 }, boxShadow: { duration: 0.3 } }
            }
          />
          <span
            className="text-xs font-medium"
            style={{ color: isActive ? colors.success[500] : darkTheme.text.secondary }}
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <EditStudentForm student={student} onEdit={onEdit} />

        <Button
          variant={isActive ? "danger" : "primary"}
          onClick={handleToggleStatus}
          disabled={isTogglingStatus}
          aria-label={`Mark ${student.firstName} ${student.lastName} ${isActive ? "inactive" : "active"}`}
        >
          {isTogglingStatus
            ? isActive
              ? "Deactivating..."
              : "Activating..."
            : isActive
              ? "Deactivate"
              : "Activate"}
        </Button>
      </div>
    </motion.li>
  );
}
