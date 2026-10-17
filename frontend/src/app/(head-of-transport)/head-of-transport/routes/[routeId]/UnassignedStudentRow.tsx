"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui/Button";
import { DragHandle, NoPinNote, draggableId, type StudentDragData } from "./studentDnd";
import { darkTheme, radius, spacing } from "@/styles/tokens";

// A student who is on no route, as shown in the "Not on a route" list.
// Kept to just the fields the row needs, so a student handed back after a
// removeStudentFromRoute() call (which only returns Stop data) fits the
// same shape without a refetch.
export interface UnassignedEntry {
  id: string;
  firstName: string;
  lastName: string;
  latitude: number | null;
  longitude: number | null;
}

interface UnassignedStudentRowProps {
  entry: UnassignedEntry;
  isPending: boolean;
  disabled: boolean;
  // Dragging stays possible while the vehicle is full (the drop is refused with
  // the reason), so it's only off while a request is in flight.
  dragDisabled: boolean;
  disabledReason?: string;
  onAdd: (entry: UnassignedEntry) => void;
}

export function UnassignedStudentRow({
  entry,
  isPending,
  disabled,
  dragDisabled,
  disabledReason,
  onAdd,
}: UnassignedStudentRowProps) {
  // Per row, so every Add button points at its own reason and no id repeats.
  const reasonId = useId();
  const hasPin = entry.latitude != null && entry.longitude != null;
  const name = `${entry.firstName} ${entry.lastName}`;
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: draggableId(entry.id),
    data: { from: "unassigned", name, entry } satisfies StudentDragData,
    disabled: dragDisabled,
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
      className={`list-none flex items-center justify-between flex-wrap ${dragDisabled ? "" : "cursor-grab"}`}
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
          disabled={dragDisabled}
          setActivatorNodeRef={setActivatorNodeRef}
          attributes={attributes}
        />
        <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
          <span className="text-sm font-medium break-words" style={{ color: darkTheme.text.primary }}>
            {name}
          </span>
          {!hasPin && <NoPinNote />}
        </div>
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
        {disabled && disabledReason && (
          <span id={reasonId} className="text-xs" style={{ color: darkTheme.text.muted }}>
            {disabledReason}
          </span>
        )}
        <Button
          variant="primary"
          disabled={disabled || isPending}
          aria-describedby={disabled && disabledReason ? reasonId : undefined}
          onClick={() => onAdd(entry)}
        >
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </motion.li>
  );
}
