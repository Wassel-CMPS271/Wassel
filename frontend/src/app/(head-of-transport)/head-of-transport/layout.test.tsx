import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HeadOfTransportLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/head-of-transport/live",
}));

vi.mock("@/components/auth/RoleGuard", () => ({
  RoleGuard: ({ role, children }: { role: string; children: ReactNode }) => (
    <div data-testid="role-guard" data-role={role}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/auth/UserBlock", () => ({
  UserBlock: () => <div data-testid="user-block">User account area</div>,
}));

describe("SCRUM-274 head of transport layout nav", () => {
  function renderLayout() {
    render(
      <HeadOfTransportLayout>
        <p>Page content</p>
      </HeadOfTransportLayout>,
    );
  }

  it("uses the HEAD_OF_TRANSPORT role guard", () => {
    renderLayout();

    expect(screen.getByTestId("role-guard")).toHaveAttribute("data-role", "HEAD_OF_TRANSPORT");
  });

  it("has a Live nav item linking to /head-of-transport/live", () => {
    renderLayout();

    const nav = screen.getByRole("navigation", { name: "Head of transport navigation" });
    const liveLink = within(nav).getByRole("link", { name: /live/i });

    expect(liveLink).toHaveAttribute("href", "/head-of-transport/live");
  });

  it("marks Live as the active nav item on /head-of-transport/live", () => {
    renderLayout();

    const nav = screen.getByRole("navigation", { name: "Head of transport navigation" });
    const liveLink = within(nav).getByRole("link", { name: /live/i });

    expect(liveLink).toHaveAttribute("aria-current", "page");
  });
});
