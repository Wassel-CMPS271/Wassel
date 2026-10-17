import { describe, expect, it } from "vitest";
import type { Active, ClientRect, Over } from "@dnd-kit/core";
import { jumpBetweenLists, studentAnnouncements, type StudentDragData } from "./studentDnd";

function rect(top: number, height: number): ClientRect {
  return { top, height, bottom: top + height, left: 0, right: 300, width: 300 };
}

// "On this route" above "Not on a route", as on the page.
const DROPPABLES = new Map([
  ["on-route", rect(100, 200)],
  ["unassigned", rect(340, 400)],
]);

function jump(code: string, card: ClientRect) {
  const event = new KeyboardEvent("keydown", { code, cancelable: true });
  const coordinates = jumpBetweenLists(event, {
    active: "student-s-1",
    currentCoordinates: { x: card.left, y: card.top },
    context: { collisionRect: card, droppableRects: DROPPABLES } as never,
  });
  return { coordinates, defaultPrevented: event.defaultPrevented };
}

describe("jumpBetweenLists", () => {
  it("moves a card down into the top of the list below", () => {
    expect(jump("ArrowDown", rect(150, 60))).toEqual({
      coordinates: { x: 0, y: 348 },
      defaultPrevented: true,
    });
  });

  it("moves a card up into the top of the list above", () => {
    expect(jump("ArrowUp", rect(600, 60)).coordinates).toEqual({ x: 0, y: 108 });
  });

  it("stays put when there's no list in that direction", () => {
    expect(jump("ArrowUp", rect(150, 60)).coordinates).toBeUndefined();
    expect(jump("ArrowDown", rect(600, 60)).coordinates).toBeUndefined();
  });

  it("ignores left and right", () => {
    expect(jump("ArrowRight", rect(150, 60))).toEqual({
      coordinates: undefined,
      defaultPrevented: false,
    });
  });
});

describe("studentAnnouncements", () => {
  const omar: StudentDragData = {
    from: "unassigned",
    name: "Omar Nasser",
    entry: { id: "s-2", firstName: "Omar", lastName: "Nasser", latitude: null, longitude: null },
  };
  const active = { id: "student-s-2", data: { current: omar } } as unknown as Active;
  const onRoute = { id: "on-route" } as Over;
  const unassigned = { id: "unassigned" } as Over;

  it("says where the card is and what a drop will do", () => {
    const announce = studentAnnouncements(undefined);
    expect(announce.onDragStart({ active })).toBe("Picked up Omar Nasser from Not on a route.");
    expect(announce.onDragOver({ active, over: onRoute })).toBe(
      "Omar Nasser is over On this route. Drop to move them here.",
    );
    expect(announce.onDragOver({ active, over: unassigned })).toBe(
      "Omar Nasser is back over Not on a route.",
    );
    expect(announce.onDragEnd({ active, over: onRoute })).toBe("Dropped Omar Nasser on On this route.");
    expect(announce.onDragEnd({ active, over: null })).toBe("Omar Nasser was not moved.");
  });

  it("gives the warning when the route list would refuse the drop", () => {
    const announce = studentAnnouncements("This vehicle is full (3 of 3 seats).");
    expect(announce.onDragOver({ active, over: onRoute })).toBe(
      "Omar Nasser is over On this route. This vehicle is full (3 of 3 seats). Dropping here won't add them.",
    );
    expect(announce.onDragEnd({ active, over: onRoute })).toBe(
      "Omar Nasser was not added. This vehicle is full (3 of 3 seats).",
    );
  });
});
