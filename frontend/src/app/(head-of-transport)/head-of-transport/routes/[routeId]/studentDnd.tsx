"use client";

// Drag and drop between the "On this route" and "Not on a route" lists
// (SCRUM-219). A drop only decides which of the page's add/remove handlers to
// call; the Add and Remove buttons stay the accessible way to do the same thing.

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type DraggableAttributes,
  type KeyboardCoordinateGetter,
  type Over,
  type PointerSensorOptions,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import type { Stop } from "@/lib/api/routes";
import type { UnassignedEntry } from "./UnassignedStudentRow";
import { GripIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

export type ListId = "on-route" | "unassigned";

export const LIST_LABELS: Record<ListId, string> = {
  "on-route": "On this route",
  unassigned: "Not on a route",
};

// What a card carries while it's dragged, so the drop knows who moved and from where.
export type StudentDragData =
  | { from: "on-route"; name: string; stop: Stop }
  | { from: "unassigned"; name: string; entry: UnassignedEntry };

export function draggableId(studentId: string): string {
  return `student-${studentId}`;
}

export function dragData(active: Active | null): StudentDragData | undefined {
  return active?.data.current as StudentDragData | undefined;
}

function otherList(list: ListId): ListId {
  return list === "on-route" ? "unassigned" : "on-route";
}

function overList(over: Over | null): ListId | undefined {
  return over?.id === "on-route" || over?.id === "unassigned" ? over.id : undefined;
}

// PointerSensor for mouse and pen only. A pointerdown goes to the first sensor
// that wants it, so without this a finger would never reach TouchSensor (press
// and hold), and a swipe that starts on a card must still scroll the page.
class MouseAndPenSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (event: ReactPointerEvent, options: PointerSensorOptions) =>
        event.nativeEvent.pointerType !== "touch" &&
        PointerSensor.activators[0].handler(event, options),
    },
  ];
}

// Up and Down move the card straight into the list above or below, instead of
// the default nudge of a few pixels per key press.
export const jumpBetweenLists: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const { collisionRect, droppableRects } = context;
  if (!collisionRect || (event.code !== "ArrowUp" && event.code !== "ArrowDown")) return undefined;
  event.preventDefault();

  const cardMiddle = collisionRect.top + collisionRect.height / 2;
  let target: { top: number } | undefined;
  for (const rect of droppableRects.values()) {
    const isCandidate = event.code === "ArrowDown" ? rect.top > cardMiddle : rect.bottom < cardMiddle;
    const isCloser =
      !target || (event.code === "ArrowDown" ? rect.top < target.top : rect.top > target.top);
    if (isCandidate && isCloser) target = rect;
  }
  if (!target) return undefined;
  // Just inside the top of the list, so the card is over it however long the list is.
  return { x: currentCoordinates.x, y: target.top + parseInt(spacing.sm, 10) };
};

export function useStudentSensors() {
  return useSensors(
    // 8px of movement before a drag starts, so clicking Add/Remove is still a click.
    useSensor(MouseAndPenSensor, { activationConstraint: { distance: 8 } }),
    // Press and hold, so a swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: jumpBetweenLists }),
  );
}

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To move this student to the other list, press Space or Enter, then use the up and down arrow keys. Press Space or Enter again to drop, or Escape to cancel. The Add and Remove buttons do the same thing.",
};

// `refusal` is why the route list won't take a student right now (vehicle
// full), or undefined when it will.
export function studentAnnouncements(refusal: string | undefined): Announcements {
  function describeOver(data: StudentDragData, list: ListId | undefined): string {
    if (!list) return `${data.name} is not over a list.`;
    if (list === data.from) return `${data.name} is back over ${LIST_LABELS[list]}.`;
    if (list === "on-route" && refusal) {
      return `${data.name} is over ${LIST_LABELS[list]}. ${refusal} Dropping here won't add them.`;
    }
    return `${data.name} is over ${LIST_LABELS[list]}. Drop to move them here.`;
  }

  return {
    onDragStart({ active }) {
      const data = dragData(active);
      return data && `Picked up ${data.name} from ${LIST_LABELS[data.from]}.`;
    },
    onDragOver({ active, over }) {
      const data = dragData(active);
      return data && describeOver(data, overList(over));
    },
    onDragEnd({ active, over }) {
      const data = dragData(active);
      if (!data) return undefined;
      const list = overList(over);
      if (!list || list === data.from) return `${data.name} was not moved.`;
      if (list === "on-route" && refusal) return `${data.name} was not added. ${refusal}`;
      return `Dropped ${data.name} on ${LIST_LABELS[list]}.`;
    },
    onDragCancel({ active }) {
      const data = dragData(active);
      return data && `Moving ${data.name} was cancelled. They stay in ${LIST_LABELS[data.from]}.`;
    },
  };
}

interface DropZoneProps {
  id: ListId;
  // Whether this list would refuse a student dropped on it right now.
  refuses: boolean;
  refusal?: string;
  labelledBy: string;
  children: ReactNode;
}

// One list's section, highlighted while a card from the other list is dragged:
// a dashed border when it can take the card, plus a tint when the card is over
// it. A list that would refuse the drop shows the warning colors and the reason.
export function DropZone({ id, refuses, refusal, labelledBy, children }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { active } = useDndContext();
  const prefersReducedMotion = useReducedMotion();
  const data = dragData(active);
  const isTarget = data !== undefined && data.from === otherList(id);
  const isRefused = isTarget && refuses;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={labelledBy}
      style={{
        padding: spacing.sm,
        margin: `-${spacing.sm}`,
        borderRadius: radius.lg,
        // An outline rather than a border, so the highlight doesn't shift the layout.
        outline: `2px dashed ${
          isTarget
            ? isRefused
              ? darkTheme.interactive.dropRefusedBorder
              : darkTheme.interactive.dropTargetBorder
            : "transparent"
        }`,
        backgroundColor:
          isTarget && isOver
            ? isRefused
              ? darkTheme.interactive.dropRefusedBg
              : darkTheme.interactive.dropTargetBg
            : "transparent",
        transition: prefersReducedMotion ? undefined : "background-color 0.2s ease-out, outline-color 0.2s ease-out",
      }}
    >
      {children}
      {isRefused && isOver && refusal && (
        // aria-hidden: the drag announcements already say this to screen readers.
        <p
          aria-hidden="true"
          className="text-sm font-medium"
          style={{ color: darkTheme.interactive.dropRefusedBorder, marginTop: spacing.sm }}
        >
          {refusal}
        </p>
      )}
    </section>
  );
}

interface DragHandleProps {
  name: string;
  disabled: boolean;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
}

// The keyboard way into a drag. The mouse and touch can grab anywhere on the card.
export function DragHandle({ name, disabled, setActivatorNodeRef, attributes }: DragHandleProps) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      disabled={disabled}
      aria-label={`Move ${name}`}
      className="inline-flex items-center justify-center shrink-0 rounded-md cursor-grab disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        width: sizing.tapTarget,
        height: sizing.tapTarget,
        color: darkTheme.text.muted,
        outlineColor: darkTheme.interactive.focusRing,
      }}
    >
      <GripIcon size={16} />
    </button>
  );
}

// The card that follows the pointer (or the keyboard) during a drag.
export function StudentDragPreview({ name }: { name: string }) {
  return (
    <div
      className="flex items-center text-sm font-medium cursor-grabbing"
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        border: `1px solid ${darkTheme.interactive.dropTargetBorder}`,
        borderRadius: radius.md,
        backgroundColor: darkTheme.surface.card,
        boxShadow: darkTheme.surface.cardShadow,
        color: darkTheme.text.primary,
      }}
    >
      <GripIcon size={16} />
      {name}
    </div>
  );
}

// Marks a student with no map pin, on either list. Same wording and color as
// the students page (SCRUM-222); not role="alert", or every unpinned row would
// be announced on load. warning[500] on surface.card is ~7.7:1.
export function NoPinNote() {
  return (
    <span className="text-xs font-medium" style={{ color: colors.warning[500] }}>
      Needs pin: can&apos;t be shown on the map or optimized yet
    </span>
  );
}
