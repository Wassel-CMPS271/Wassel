// RunControlRow (SCRUM-274): a pure presentational component driven by an ActiveRunView, so these render it
// directly with hand-built views instead of going through the API.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RunSummary } from "@/lib/api/runs";
import type { ActiveRunView } from "./liveRuns";
import { RunControlRow } from "./RunControlRow";

// LabelledItem bolds the label in its own <span>, so the label+value text is split across elements; the
// default getByText(string) only looks at an element's direct text-node children (not nested elements), so
// it never finds the combined "Planned 07:18" wording. This checks the element's full textContent instead.
function fullText(expected: string) {
  return (_: string, element: Element | null) =>
    element?.tagName.toLowerCase() === "p" && element.textContent === expected;
}

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    date: "2026-11-16",
    direction: "MORNING",
    state: "IN_PROGRESS",
    schoolTime: "07:30",
    startedAt: "2026-11-16T05:00:00Z",
    endedAt: null,
    route: { id: "route-1", name: "Hamra" },
    vehicle: { id: "v-1", plateNumber: "A 123456", capacity: 14 },
    driver: { id: "d-1", firstName: "Karim", lastName: "Haddad" },
    counts: { students: 5, absent: 0, pickedUp: 2, droppedOff: 0, notPresent: 0 },
    locationSharing: true,
    ...overrides,
  };
}

function view(overrides: Partial<ActiveRunView> = {}): ActiveRunView {
  return {
    run: run(),
    freshness: "LIVE",
    unavailableReason: null,
    position: { latitude: 33.89, longitude: 35.5, accuracyMeters: 10, receivedAt: "2026-11-16T05:20:00Z", ageSeconds: 8 },
    remainingStops: 3,
    nextStop: {
      studentId: "s-1",
      firstName: "Hadi",
      lastName: "Rizk",
      plannedTime: "07:18",
      liveEstimate: { arrivesAt: "2026-11-16T04:22:00Z", secondsAway: 240 },
    },
    serverLateFlag: null,
    ...overrides,
  };
}

describe("RunControlRow", () => {
  it("shows the route, direction, driver, remaining stops and next stop's student", () => {
    render(<RunControlRow view={view()} onReassign={vi.fn()} />);
    expect(screen.getByText("Hamra")).toBeInTheDocument();
    expect(screen.getByText(/Morning/)).toBeInTheDocument();
    expect(screen.getByText(/Karim Haddad/)).toBeInTheDocument();
    expect(screen.getByText("3 stops left")).toBeInTheDocument();
    expect(screen.getByText(/Hadi Rizk/)).toBeInTheDocument();
  });

  it("shows planned and the live estimate as two separate labelled items (06:22 Beirut time)", () => {
    render(<RunControlRow view={view()} onReassign={vi.fn()} />);
    expect(screen.getByText(fullText("Planned 07:18"))).toBeInTheDocument();
    expect(screen.getByText(fullText("Live estimate about 06:22"))).toBeInTheDocument();
  });

  it("an afternoon run with no planned time shows only the estimate", () => {
    render(
      <RunControlRow
        view={view({
          run: run({ direction: "AFTERNOON" }),
          nextStop: {
            studentId: "s-1",
            firstName: "Sara",
            lastName: "Khoury",
            plannedTime: null,
            liveEstimate: { arrivesAt: "2026-11-16T04:22:00Z", secondsAway: 240 },
          },
        })}
        onReassign={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Planned/)).not.toBeInTheDocument();
    expect(screen.getByText(fullText("Live estimate about 06:22"))).toBeInTheDocument();
  });

  it.each([
    ["STALE", null, "position too old"],
    ["UNAVAILABLE", "NOT_SHARING", "driver not sharing"],
    ["UNAVAILABLE", "NO_RECENT_POSITION", "no position yet"],
  ] as const)("a null estimate under %s/%s says why in plain words: %s", (freshness, reason, expected) => {
    render(
      <RunControlRow
        view={view({
          freshness,
          unavailableReason: reason,
          position: null,
          nextStop: { studentId: "s-1", firstName: "Hadi", lastName: "Rizk", plannedTime: "07:18", liveEstimate: null },
        })}
        onReassign={vi.fn()}
      />,
    );
    expect(screen.getByText(`No live estimate: ${expected}.`)).toBeInTheDocument();
  });

  it("all stops done: no next-stop block", () => {
    render(<RunControlRow view={view({ remainingStops: 0, nextStop: null })} onReassign={vi.fn()} />);
    expect(screen.getByText("All stops done")).toBeInTheDocument();
    expect(screen.queryByText(/Next stop/)).not.toBeInTheDocument();
  });

  it("never prints the word late anywhere", () => {
    render(<RunControlRow view={view()} onReassign={vi.fn()} />);
    expect(screen.queryByText(/late/i)).not.toBeInTheDocument();
  });

  it("calls onReassign from the row's button", async () => {
    const onReassign = vi.fn();
    render(<RunControlRow view={view()} onReassign={onReassign} />);
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(screen.getByRole("button", { name: /Reassign driver/i }));
    expect(onReassign).toHaveBeenCalledTimes(1);
  });
});
