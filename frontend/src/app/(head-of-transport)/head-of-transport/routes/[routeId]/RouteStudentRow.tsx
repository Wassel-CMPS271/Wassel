"use client";

import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/Button";
import type { Stop } from "@/lib/api/routes";
import { DragHandle, MoveButton, NoPinNote, draggableId, type StudentDragData } from "./studentDnd";
import { Badge } from "./RouteMap";
import { darkTheme, radius, spacing } from "@/styles/tokens";

interface RouteStudentRowProps {
  stop: Stop;
  isPending: boolean;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: (stop: Stop) => void;
  onMoveUp: (stop: Stop) => void;
  onMoveDown: (stop: Stop) => void;
}

export function RouteStudentRow({
  stop,
  isPending,
  disabled,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveUp,
  onMoveDown,
}: RouteStudentRowProps) {
  const hasPin = stop.latitude != null && stop.longitude != null;
  const name = `${stop.firstName} ${stop.lastName}`;
  // useSortable (not useDraggable): besides carrying the card, every stop is
  // also a drop target for its neighbours, so one can be dragged onto
  // another to reorder the route (SCRUM-221/SCRUM-73). Its live transform is
  // left unused; the list's own layout animation (below) moves the rows once
  // the backend confirms the new order, same as every other change here.
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useSortable({
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
        <Badge>{stop.position}</Badge>
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

      <div className="flex items-center" style={{ gap: spacing.sm }}>
        {canMoveUp && (
          <MoveButton
            studentId={stop.studentId}
            name={name}
            direction="up"
            disabled={disabled}
            onMove={() => onMoveUp(stop)}
          />
        )}
        {canMoveDown && (
          <MoveButton
            studentId={stop.studentId}
            name={name}
            direction="down"
            disabled={disabled}
            onMove={() => onMoveDown(stop)}
          />
        )}
        <Button variant="secondary" disabled={disabled || isPending} onClick={() => onRemove(stop)}>
          {isPending ? "Removing…" : "Remove"}
        </Button>
      </div>
    </motion.li>
  );
}
