// FreshnessStatus (SCRUM-274): a pure presentational component, so these render it directly with every
// combination of props rather than going through the API.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessStatus } from "./FreshnessStatus";

// Matches liveRuns.ts's formatClockTime: HH:mm:ss in the school's zone, not the test machine's local zone.
function beirutClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Beirut",
  }).format(date);
}

describe("FreshnessStatus", () => {
  it("LIVE says Live", () => {
    render(<FreshnessStatus freshness="LIVE" unavailableReason={null} ageSeconds={null} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it.each(["LIVE", "STALE", "UNAVAILABLE"] as const)(
    "%s while positions aren't refreshing: a neutral 'Position as of', no Live and no pulse",
    (freshness) => {
      const since = new Date(Date.UTC(2026, 10, 16, 5, 20, 0));
      const time = beirutClock(since);
      const { container } = render(
        <FreshnessStatus freshness={freshness} unavailableReason={null} ageSeconds={140} notRefreshingSince={since} />,
      );
      expect(screen.getByText(`Position as of ${time} (not refreshing)`)).toBeInTheDocument();
      expect(screen.queryByText(/Live|Last seen/)).not.toBeInTheDocument();
      expect(container.querySelector(".animate-ping")).toBeNull();
    },
  );

  it("with no location row yet, still says the position is unknown even while not refreshing", () => {
    render(<FreshnessStatus freshness={null} unavailableReason={null} ageSeconds={null} notRefreshingSince={new Date()} />);
    expect(screen.getByText("Position unknown")).toBeInTheDocument();
  });

  it("STALE under a minute shows seconds", () => {
    render(<FreshnessStatus freshness="STALE" unavailableReason={null} ageSeconds={45} />);
    expect(screen.getByText("Last seen 45s ago")).toBeInTheDocument();
  });

  it("STALE over a minute shows whole minutes", () => {
    render(<FreshnessStatus freshness="STALE" unavailableReason={null} ageSeconds={140} />);
    expect(screen.getByText("Last seen 2 min ago")).toBeInTheDocument();
  });

  it("UNAVAILABLE with the driver not sharing says so", () => {
    render(<FreshnessStatus freshness="UNAVAILABLE" unavailableReason="NOT_SHARING" ageSeconds={null} />);
    expect(screen.getByText("Driver is not sharing location")).toBeInTheDocument();
  });

  it("UNAVAILABLE with no recent fix says so", () => {
    render(<FreshnessStatus freshness="UNAVAILABLE" unavailableReason="NO_RECENT_POSITION" ageSeconds={null} />);
    expect(screen.getByText("No recent position")).toBeInTheDocument();
  });

  it("before /locations has answered, says the position is unknown rather than UNAVAILABLE", () => {
    render(<FreshnessStatus freshness={null} unavailableReason={null} ageSeconds={null} />);
    expect(screen.getByText("Position unknown")).toBeInTheDocument();
  });

  it("never uses the word late", () => {
    for (const props of [
      { freshness: null, unavailableReason: null, ageSeconds: null },
      { freshness: "LIVE" as const, unavailableReason: null, ageSeconds: null },
      { freshness: "STALE" as const, unavailableReason: null, ageSeconds: 140 },
      { freshness: "UNAVAILABLE" as const, unavailableReason: "NOT_SHARING" as const, ageSeconds: null },
    ]) {
      const { unmount } = render(<FreshnessStatus {...props} />);
      expect(screen.queryByText(/late/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("each state has its own shape, not color alone", () => {
    const { container: live } = render(<FreshnessStatus freshness="LIVE" unavailableReason={null} ageSeconds={null} />);
    const { container: stale } = render(
      <FreshnessStatus freshness="STALE" unavailableReason={null} ageSeconds={10} />,
    );
    const { container: unavailable } = render(
      <FreshnessStatus freshness="UNAVAILABLE" unavailableReason="NOT_SHARING" ageSeconds={null} />,
    );
    expect(live.querySelector("circle[fill]")).not.toBeNull();
    expect(stale.querySelector("circle[fill='none']")).not.toBeNull();
    expect(unavailable.querySelector("path")).not.toBeNull();
  });
});
