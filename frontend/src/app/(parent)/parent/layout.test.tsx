import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParentLayout from "./layout";

vi.mock("@/components/auth/RoleGuard", () => ({
  useCurrentUser: () => ({ id: "parent-layout", schoolId: "school-layout" }),
  RoleGuard: ({
    role,
    children,
  }: {
    role: string;
    children: ReactNode;
  }) => (
    <div data-testid="role-guard" data-role={role}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/auth/UserBlock", () => ({
  UserBlock: () => (
    <div data-testid="user-block">User account area</div>
  ),
}));

describe("SCRUM-185 Parent layout", () => {
  function renderLayout() {
    render(
      <ParentLayout>
        <p>Parent home content</p>
      </ParentLayout>
    );
  }

  it("uses the PARENT role guard", () => {
    renderLayout();

    expect(screen.getByTestId("role-guard"))
      .toHaveAttribute("data-role", "PARENT");
  });

  it("displays Wassel branding", () => {
  renderLayout();

  const brandLink = screen.getByRole("link", {
    name: /Wassel/i,
  });

  expect(brandLink).toHaveAttribute("href", "/parent");
  expect(within(brandLink).getByText("Parent")).toBeInTheDocument();
});

  it("links to My children and keeps unfinished destinations disabled", () => {
    renderLayout();

    const nav = screen.getByRole("navigation", {
      name: "Parent navigation",
    });

    expect(within(nav).getByText("My children")).toBeInTheDocument();
    expect(within(nav).getByText("School route")).toBeInTheDocument();
    expect(within(nav).getByText("Profile")).toBeInTheDocument();

    expect(within(nav).getAllByText("Soon")).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "My children" })).toHaveAttribute("href", "/parent");

    const disabledItems = nav.querySelectorAll(
      '[aria-disabled="true"]'
    );
    expect(disabledItems).toHaveLength(2);
  });

  it("renders the user area and page content", () => {
    renderLayout();

    expect(screen.getByTestId("user-block")).toBeInTheDocument();
    expect(screen.getByText("Parent home content")).toBeInTheDocument();
  });
});