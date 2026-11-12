import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import sample from "../../../../../docs/contracts/samples/runs/parent-children.json";
import ParentHome from "./page";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("chooses a child from the preserved home, loads its absences and switches to another child", async () => {
  vi.stubEnv("NEXT_PUBLIC_PARENT_HOME_PREVIEW", "false");
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/absences") ? [] : sample), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<ParentHome />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage absences for Layla Mansour" }));
  await screen.findByRole("heading", { name: "Absences for Layla Mansour" });
  await screen.findByText("No upcoming absences.");
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/children/${sample[0].studentId}/absences`), expect.objectContaining({ credentials: "include" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose another child / Back to children" }));
  fireEvent.click(await screen.findByRole("button", { name: "Manage absences for Tarek Mansour" }));
  await screen.findByText("No upcoming absences.");
  expect(screen.getByRole("heading", { name: "Absences for Tarek Mansour" })).toBeVisible();
  expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining(`/children/${sample[1].studentId}/absences`), expect.objectContaining({ credentials: "include" }));
});
