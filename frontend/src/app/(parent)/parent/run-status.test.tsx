import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../../../../docs/contracts/samples/runs/parent-children.json";
import { getMyChildren, type Child, type ChildRun } from "@/lib/api/myChildren";
import { ChildTransportCard } from "./ChildTransportCard";
import ParentHome from "./page";

const fetch = vi.fn();
const child = sample[1] as Child;
const run = (state: ChildRun["state"], stopsLeft: number | null = null, direction: ChildRun["direction"] = "MORNING"): ChildRun => ({ state, stopsLeft, direction });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { fetch.mockReset(); vi.stubGlobal("fetch", fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SCRUM-251 authoritative per-child run status", () => {
  it.each([["NOT_STARTED", "Run not started"], ["IN_PROGRESS", "Bus on the way"], ["FINISHED", "Run finished"]] as const)("shows %s in plain text", (state, label) => {
    render(<ChildTransportCard child={{ ...child, todayRun: run(state) }} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.getByText("Morning run")).toBeVisible();
    expect(screen.getByRole("link", { name: /call driver/i })).toHaveAttribute("href", "tel:+9613100101");
  });
  it.each([[0, "Your child is next"], [1, "1 stop before your child"], [4, "4 stops before your child"]])("preserves the count %s, including zero", (count, label) => {
    render(<ChildTransportCard child={{ ...child, todayRun: run("IN_PROGRESS", Number(count)) }} />);
    expect(screen.getByText(String(label))).toBeVisible();
  });
  it("shows afternoon independently of the planned morning pickup", () => {
    render(<ChildTransportCard child={{ ...child, todayRun: run("IN_PROGRESS", 2, "AFTERNOON") }} />);
    expect(screen.getByText("Afternoon run")).toBeVisible();
    expect(screen.getByText("Planned morning pickup")).toBeVisible();
    expect(screen.getByText("2 stops before your child")).toBeVisible();
  });
  it.each(["NOT_STARTED", "IN_PROGRESS", "FINISHED"] as const)("never invents a count when %s supplies null", state => {
    render(<ChildTransportCard child={{ ...child, todayRun: run(state) }} />);
    expect(screen.queryByText(/stops? before your child|your child is next/i)).not.toBeInTheDocument();
  });
  it.each([child, sample[0] as Child])("omits all extra run UI for no run today", value => {
    render(<ChildTransportCard child={{ ...value, todayRun: null }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/no run today|bus on the way|run not started|run finished/i)).not.toBeInTheDocument();
  });
  it("keeps sibling statuses separate", () => {
    render(<><ChildTransportCard child={{ ...child, todayRun: run("IN_PROGRESS", 0) }} /><ChildTransportCard child={{ ...child, studentId: "sibling", firstName: "Sibling", todayRun: run("FINISHED", null, "AFTERNOON") }} /></>);
    expect(within(screen.getByRole("region", { name: "Tarek Mansour" })).getByText("Your child is next")).toBeVisible();
    const sibling = within(screen.getByRole("region", { name: "Sibling Mansour" }));
    expect(sibling.getByText("Run finished")).toBeVisible();
    expect(sibling.queryByText("Your child is next")).not.toBeInTheDocument();
  });
  it.each([undefined, {}, { direction: "EVENING", state: "IN_PROGRESS", stopsLeft: 1 }, run("IN_PROGRESS", -1), run("IN_PROGRESS", 1.5), run("FINISHED", 2), { ...run("IN_PROGRESS"), stopsLeft: "2" }, { ...run("IN_PROGRESS"), state: "MOVING" }])("rejects invalid run contract %j", async todayRun => {
    fetch.mockResolvedValue(response([{ ...child, todayRun }]));
    await expect(getMyChildren()).rejects.toThrow("Invalid parent children response");
  });
  it("refreshes the authenticated endpoint after driver progress without a reload", async () => {
    fetch.mockResolvedValueOnce(response([{ ...child, todayRun: run("NOT_STARTED") }])).mockResolvedValueOnce(response([{ ...child, todayRun: run("IN_PROGRESS", 0) }]));
    render(<ParentHome />);
    await screen.findByText("Run not started");
    fireEvent.click(screen.getByRole("button", { name: "Refresh transport details" }));
    await screen.findByText("Your child is next");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(expect.stringMatching(/\/api\/parent\/children$/), expect.objectContaining({ credentials: "include" }));
  });
  it("retains transport and marks the last result stale after an outage, then retries", async () => {
    fetch.mockResolvedValueOnce(response([{ ...child, todayRun: run("IN_PROGRESS", 2) }])).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(response([{ ...child, todayRun: run("FINISHED") }]));
    render(<ParentHome />); await screen.findByText("2 stops before your child");
    fireEvent.click(screen.getByRole("button", { name: "Refresh transport details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Showing the last loaded details");
    expect(screen.getByRole("link", { name: /call driver/i })).toBeVisible();
    expect(screen.getByText("2 stops before your child")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh transport details" }));
    await screen.findByText("Run finished");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each([401, 403])("removes stale private cards after refresh HTTP %s", async status => {
    fetch.mockResolvedValueOnce(response([{ ...child, todayRun: run("IN_PROGRESS", 0) }])).mockResolvedValueOnce(response({ detail: "Denied" }, status));
    render(<ParentHome />); await screen.findByText("Your child is next");
    fireEvent.click(screen.getByRole("button", { name: "Refresh transport details" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("region", { name: "Tarek Mansour" })).not.toBeInTheDocument();
    if (status === 401) expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
