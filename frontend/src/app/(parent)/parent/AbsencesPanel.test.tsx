import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbsencesPanel } from "./AbsencesPanel";
import * as api from "@/lib/api/absences";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import type { Child } from "@/lib/api/myChildren";

vi.mock("@/lib/api/absences", async original => ({ ...await original<typeof api>(), getAbsences: vi.fn(), reportAbsence: vi.fn(), cancelAbsence: vi.fn(), schoolToday: () => "2026-10-30" }));
const child: Child = { studentId: "child", firstName: "Layla", lastName: "Nasser", route: null, driver: null, vehicle: null, expectedPickupTime: null, todayRun: null };
const row = { id: "a", studentId: "child", fromDate: "2026-11-02", toDate: "2026-11-03" };
const get = vi.mocked(api.getAbsences), post = vi.mocked(api.reportAbsence), del = vi.mocked(api.cancelAbsence);
async function open(rows: api.Absence[] = []) { get.mockResolvedValue(rows); const back = vi.fn(); render(<AbsencesPanel child={child} onBack={back} />); await screen.findByRole("heading", { name: "Upcoming absences" }); return back; }
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const date = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => { vi.clearAllMocks(); post.mockResolvedValue({ ...row, fromDate: "2026-10-30", toDate: "2026-10-30" }); del.mockResolvedValue(); });

describe("parent absence acceptance criteria", () => {
  it("loads the selected owned child even without a route and has an empty state", async () => {
    await open(); expect(get).toHaveBeenCalledWith("child"); expect(screen.getByText("No upcoming absences.")).toBeVisible(); expect(screen.getByRole("heading", { name: "Absences for Layla Nasser" })).toHaveFocus();
  });
  it("shows loading before the API replies", () => { get.mockReturnValue(new Promise(() => {})); render(<AbsencesPanel child={child} onBack={vi.fn()} />); expect(screen.getByRole("status")).toHaveTextContent("Loading"); expect(screen.queryByRole("button", { name: "Report absence" })).not.toBeInTheDocument(); });
  it("reports one day, sends no made-up parent identity and updates without reloading", async () => {
    await open(); click("Report absence"); await screen.findByText("Absence reported.");
    expect(post).toHaveBeenCalledWith("child", { fromDate: "2026-10-30" }); expect(screen.getByText("2026-10-30")).toBeVisible(); expect(get).toHaveBeenCalledTimes(1);
  });
  it("reports an inclusive date range", async () => {
    await open(); fireEvent.click(screen.getByLabelText("Report a date range")); date("Start date", row.fromDate); date("End date", row.toDate); post.mockResolvedValue(row); click("Report absence");
    await screen.findByText("2026-11-02 to 2026-11-03 (inclusive)"); expect(post).toHaveBeenCalledWith("child", { fromDate: row.fromDate, toDate: row.toDate });
  });
  it("blocks past dates and inverted ranges before POST", async () => {
    await open(); date("Absence date", "2026-10-29"); click("Report absence"); expect(screen.getByText("Choose today or a future date.")).toBeVisible(); expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Report a date range")); date("Start date", "2026-11-03"); date("End date", "2026-11-02"); click("Report absence"); expect(screen.getByText(/Choose an end date/)).toBeVisible(); expect(post).not.toHaveBeenCalled();
  });
  it("keeps an exact-repeat 200 as one list entry", async () => {
    await open([row]); post.mockResolvedValue(row); date("Absence date", row.fromDate); click("Report absence"); await screen.findByText("Absence reported."); expect(screen.getAllByRole("button", { name: "Cancel absence" })).toHaveLength(1);
  });
  it("shows overlap errors at the date field and allows a corrected retry", async () => {
    await open(); post.mockRejectedValueOnce(new ApiValidationError({ fromDate: "Overlaps 2–3 November" })); click("Report absence"); await screen.findByText("Overlaps 2–3 November"); expect(screen.getByLabelText("Absence date")).toHaveAttribute("aria-invalid", "true"); date("Absence date", "2026-11-04"); click("Report absence"); await screen.findByText("Absence reported.");
  });
  it("does not add optimistic records on network failure and retries", async () => {
    await open(); post.mockRejectedValueOnce(new Error("offline")); click("Report absence"); await screen.findByRole("alert"); expect(screen.getByText("No upcoming absences.")).toBeVisible(); click("Report absence"); await screen.findByText("Absence reported.");
  });
  it("requires confirmation and allows Keep and Escape without DELETE", async () => {
    await open([row]); expect(screen.getByText("Upcoming absence")).toBeVisible(); click("Cancel absence"); expect(screen.getByRole("button", { name: "Confirm cancellation" })).toHaveFocus(); click("Keep absence"); expect(del).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Cancel absence" })).toHaveFocus(); click("Cancel absence"); fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" }); expect(screen.queryByRole("group")).not.toBeInTheDocument(); expect(del).not.toHaveBeenCalled();
  });
  it("cancels after server success and updates the upcoming list", async () => {
    await open([row]); click("Cancel absence"); click("Confirm cancellation"); await screen.findByText("Absence cancelled."); expect(del).toHaveBeenCalledWith("child", "a"); expect(screen.getByText("No upcoming absences.")).toBeVisible(); expect(get).toHaveBeenCalledTimes(1);
  });
  it("explains cancellation of an ongoing range without erasing past history", async () => {
    await open([{ ...row, fromDate: "2026-10-29" }]); expect(screen.getByText("Ongoing absence")).toBeVisible(); click("Cancel absence"); expect(screen.getByText(/Only today and future days/)).toBeVisible(); click("Confirm cancellation"); await screen.findByText("Upcoming days cancelled. Past absence days remain recorded.");
  });
  it("keeps the record and confirmation after a failed DELETE; retries", async () => {
    await open([row]); del.mockRejectedValueOnce(new ApiError(409)); click("Cancel absence"); click("Confirm cancellation"); await screen.findByRole("alert"); expect(screen.getByText(/2026-11-02 to/)).toBeVisible(); click("Confirm cancellation"); await screen.findByText("Absence cancelled.");
  });
  it("prevents duplicate POSTs and child changes while a request is pending", async () => {
    const back = await open(); let finish!: (value: api.Absence) => void; post.mockReturnValue(new Promise(resolve => { finish = resolve; })); click("Report absence"); fireEvent.submit(screen.getByRole("button", { name: "Saving…" }).closest("form")!); expect(post).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: /Choose another child/ })).toBeDisabled(); expect(back).not.toHaveBeenCalled(); await act(async () => finish(row)); await screen.findByText("Absence reported.");
  });
  it.each([401, 403, 404, 500])("shows HTTP %s load failure without fake records, then retries", async status => {
    get.mockRejectedValueOnce(new ApiError(status)).mockResolvedValueOnce([]); render(<AbsencesPanel child={child} onBack={vi.fn()} />); await screen.findByRole("alert"); expect(screen.queryByText("No upcoming absences.")).not.toBeInTheDocument(); click("Retry loading absences"); await screen.findByText("No upcoming absences.");
  });
  it("ignores an old child's response after selection changes", async () => {
    let finish!: (value: api.Absence[]) => void; get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([]);
    const view = render(<AbsencesPanel child={child} onBack={vi.fn()} />); view.rerender(<AbsencesPanel child={{ ...child, studentId: "other", firstName: "Tarek" }} onBack={vi.fn()} />); await screen.findByText("No upcoming absences."); await act(async () => finish([row])); expect(within(screen.getByRole("region")).queryByText(/2026-11-02/)).not.toBeInTheDocument();
  });
  it("returns to the child chooser", async () => { const back = await open(); click("Choose another child / Back to children"); expect(back).toHaveBeenCalledOnce(); });
});
