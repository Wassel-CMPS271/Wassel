// FreshnessStatus (SCRUM-274): a pure presentational component, so these render it directly with every
// combination of props rather than going through the API.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessStatus } from "./FreshnessStatus";

describe("FreshnessStatus", () => {
  it("LIVE says Live", () => {
    render(<FreshnessStatus freshness="LIVE" unavailableReason={null} ageSeconds={null} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
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
