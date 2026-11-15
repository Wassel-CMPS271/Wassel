import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ArrivalCountdown } from "./ArrivalCountdown";
afterEach(() => vi.useRealTimers());
it("never derives a countdown from a missing or unverified estimate", () => { const view = render(<ArrivalCountdown estimate={new Date()} />); expect(screen.queryByRole("timer")).not.toBeInTheDocument(); view.rerender(<ArrivalCountdown estimate={null} valid />); expect(screen.getByText("Live arrival estimate is unavailable.")).toBeVisible(); });
it("updates a valid presentation estimate every second", async () => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T07:00:00Z")); render(<ArrivalCountdown estimate={new Date("2026-11-09T07:01:05Z")} valid />); expect(screen.getByRole("timer")).toHaveTextContent("1m 5s"); await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(screen.getByRole("timer")).toHaveTextContent("1m 4s"); });
it("does not claim the bus arrived after an estimate expires", () => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T07:00:00Z")); render(<ArrivalCountdown estimate={new Date("2026-11-09T06:59:00Z")} valid />); expect(screen.queryByRole("timer")).not.toBeInTheDocument(); expect(screen.getByText(/Waiting for an updated estimate/)).toBeVisible(); });
it("does not display an invalid date as an estimate", () => { render(<ArrivalCountdown estimate={new Date("bad")} valid />); expect(screen.queryByRole("timer")).not.toBeInTheDocument(); });
