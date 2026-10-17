"use client";

import { motion } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui/Button";
import type { Stop } from "@/lib/api/routes";
import { DragHandle, NoPinNote, draggableId, type StudentDragData } from "./studentDnd";
import { darkTheme, radius, spacing } from "@/styles/tokens";

interface RouteStudentRowProps {
  stop: Stop;
  isPending: boolean;
  disabled: boolean;
  onRemove: (stop: Stop) => void;
}

export function RouteStudentRow({ stop, isPending, disabled, onRemove }: RouteStudentRowProps) {
  const hasPin = stop.latitude != null && stop.longitude != null;
  const name = `${stop.firstName} ${stop.lastName}`;
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: draggableId(stop.studentId),
    data: { from: "on-route", name, stop } satisfies StudentDragData,
    disabled,
  });

  return (
    <motion.li
      ref={setNodeRef}
      {...listeners}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`list-none flex items-center justify-between flex-wrap ${disabled ? "" : "cursor-grab"}`}
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        // While its preview is being dragged, the card recedes in place.
        border: `1px ${isDragging ? "dashed" : "solid"} ${darkTheme.surface.cardBorder}`,
        borderRadius: radius.md,
        backgroundColor: isDragging ? darkTheme.surface.recede : darkTheme.surface.card,
        touchAction: "manipulation",
      }}
    >
      <div className="flex items-center min-w-0" style={{ gap: spacing.sm }}>
        <DragHandle
          name={name}
          disabled={disabled}
          setActivatorNodeRef={setActivatorNodeRef}
          attributes={attributes}
        />
        <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
          <span className="text-sm font-medium break-words" style={{ color: darkTheme.text.primary }}>
            {name}
          </span>
          {stop.address && (
            <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
              {stop.address}
            </span>
          )}
          {!hasPin && <NoPinNote />}
        </div>
      </div>

      <Button variant="secondary" disabled={disabled || isPending} onClick={() => onRemove(stop)}>
        {isPending ? "Removing…" : "Remove"}
      </Button>
    </motion.li>
  );
}
