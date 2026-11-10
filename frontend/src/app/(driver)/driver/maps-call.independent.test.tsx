import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDriverToday } from "@/lib/api/runs";
import { day, run, student } from "@/test-support/driverContract";
import type { RunStop } from "@/lib/api/runs";
import DriverTodayPage from "./page";

// Both source revisions share these spies. The separate unmocked HTTP gate
// still fails when the production screen uses samples instead of request().
const driverCalls = vi.hoisted(() => ({
  getDriverToday: vi.fn(), startRun: vi.fn(), endRun: vi.fn(), confirmStudent: vi.fn(),
}));
vi.mock("@/lib/api/runs", async () => ({
  ...await vi.importActual("@/lib/api/runs"), ...driverCalls,
}));
vi.mock("@/lib/api/runs.sample", () => ({
  getDriverTodaySample: driverCalls.getDriverToday, startRunSample: driverCalls.startRun,
  endRunSample: driverCalls.endRun, confirmStudentSample: driverCalls.confirmStudent,
}));
// Standalone page tests supply the authenticated user normally supplied by
// DriverLayout. The authorization suite exercises the actual RoleGuard.
vi.mock("@/components/auth/RoleGuard", async () => ({
  ...await vi.importActual("@/components/auth/RoleGuard"),
  useCurrentUser: () => ({ id: "user-250", email: "independent@e2e.invalid", role: "DRIVER", schoolId: "school-250" }),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

async function show(changes: Partial<RunStop> = {}) {
  vi.mocked(getDriverToday).mockResolvedValue(day([run({ stops: [student(1, changes)] })]));
  render(<DriverTodayPage />);
  const row = (await screen.findByText("Student1 Independent")).closest("li")!;
  await waitFor(() => expect(row).toBeVisible());
  return row;
}

function destination(link: HTMLElement) {
  const url = new URL(link.getAttribute("href")!);
  // The ticket gives Google as an example, not a required provider. Accept
  // standard Google/Apple/OSM and native geo links, verifying coordinates.
  expect(["https:", "geo:", "maps:", "comgooglemaps:"]).toContain(url.protocol);
  if (url.protocol === "https:") expect(url.hostname).toMatch(/(^|\.)(google\.com|apple\.com|openstreetmap\.org)$/);
  const coordinates = url.searchParams.get("destination") ?? url.searchParams.get("daddr")
    ?? url.searchParams.get("q") ?? (url.protocol === "geo:" ? url.pathname : null)
    ?? (url.searchParams.has("mlat") ? `${url.searchParams.get("mlat")},${url.searchParams.get("mlon")}` : null);
  expect(coordinates, "Maps link must identify the stop destination").not.toBeNull();
  return coordinates!.split(",").map(Number);
}

describe("SCRUM-245 independent maps and call acceptance criteria", () => {
  it("provides a navigable maps link with this stop's exact coordinates", async () => {
    const row = await show({ latitude: 33.89876, longitude: 35.48765 });
    const link = within(row).getByRole("link", { name: /open (in maps|directions to)/i });
    expect(destination(link)).toEqual([33.89876, 35.48765]);
  });

  it("accepts zero-valued coordinates as a valid location", async () => {
    const row = await show({ latitude: 0, longitude: 0 });
    expect(destination(within(row).getByRole("link", { name: /open (in maps|directions to)/i }))).toEqual([0, 0]);
  });

  it.each([{ latitude: null, longitude: null }, { latitude: null, longitude: 35.48 }, { latitude: 33.89, longitude: null }])("hides maps when coordinates are incomplete: %j", async coordinates => {
    const row = await show(coordinates);
    expect(within(row).queryByRole("link", { name: /open (in maps|directions to)/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /open (in maps|directions to)/i })).not.toBeInTheDocument();
  });

  it("provides a Call parent tel link for the student's actual guardian", async () => {
    const row = await show({ guardianPhone: "+961 71 987 654" });
    const link = within(row).getByRole("link", { name: /call .*parent/i });
    expect(link.getAttribute("href")?.replace(/[\s()-]/g, "")).toBe("tel:+96171987654");
  });

  it.each(["", "   "])("hides calling when the guardian phone is missing (%j)", async guardianPhone => {
    const row = await show({ guardianPhone });
    expect(within(row).queryByRole("link", { name: /call .*parent/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /call .*parent/i })).not.toBeInTheDocument();
  });

  it("makes both native links keyboard-accessible and at least 44px tall", async () => {
    const row = await show();
    for (const name of [/open (in maps|directions to)/i, /call .*parent/i]) {
      const link = within(row).getByRole("link", { name });
      expect(link).toHaveAttribute("href");
      expect(link.tabIndex).toBeGreaterThanOrEqual(0);
      expect(Number.parseFloat(getComputedStyle(link).minHeight)).toBeGreaterThanOrEqual(44);
    }
  });
});
