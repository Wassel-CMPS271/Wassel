// SCRUM-256: independent tests of the invite-head-of-transportation screen (SCRUM-97), written from the
// ticket's acceptance criteria and from what the backend really answers (HeadOfTransportController,
// CreateAccountRequest, GlobalExceptionHandler), not from the components. Only `fetch` is faked, so the page,
// the API module and request() all run for real; the access tests run the real RoleGuard with `/api/auth/me`
// faked at the auth module.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { me } from "@/lib/api/auth";
import AdminHome from "../page";
import AdminLayout from "../layout";
import HeadOfTransportPage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/head-of-transport",
}));

vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  me: vi.fn(),
}));

const ENDPOINT = "http://localhost:8080/api/admin/head-of-transport";
const CREATED = { id: "h-1", email: "nour.saad@example.com", status: "invited", createdAt: "2026-10-30T00:00:00Z" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function emailField() {
  return screen.getByLabelText("Email address");
}

function fillAndSend(email: string) {
  fireEvent.change(emailField(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
}

beforeEach(() => {
  replace.mockReset();
  vi.mocked(me).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC1: an invite screen with an email field that calls the existing endpoint", () => {
  it("has a titled screen with an email field and a Send invite button", () => {
    render(<HeadOfTransportPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Invite a head of transportation" })).toBeInTheDocument();
    expect(emailField()).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Send invite" })).toBeEnabled();
  });

  it("POSTs { email } to /api/admin/head-of-transport with the session cookie", async () => {
    const fetchMock = stubFetch(json(CREATED, 201));
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(options).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "nour.saad@example.com" }),
    });
  });

  it("sends the email without the spaces around it", async () => {
    const fetchMock = stubFetch(json(CREATED, 201));
    render(<HeadOfTransportPage />);

    fillAndSend("   nour.saad@example.com  ");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "nour.saad@example.com" });
  });

  it("sends one invite when the button is pressed twice quickly, and disables it meanwhile", async () => {
    let finish: (response: Response) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sending..." }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finish(json(CREATED, 201));
    expect(await screen.findByRole("button", { name: "Send invite" })).toBeEnabled();
  });
});

describe("AC2: success is confirmed on screen and the form clears", () => {
  it("shows a confirmation message and empties the email field", async () => {
    stubFetch(json(CREATED, 201));
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");

    const confirmation = await screen.findByText("Invite sent.");
    expect(confirmation.closest('[role="status"]')).toBeInTheDocument();
    await waitFor(() => expect(emailField()).toHaveValue(""));
    expect(emailField()).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can send a second invite straight after the first", async () => {
    const fetchMock = stubFetch(json(CREATED, 201), json({ ...CREATED, id: "h-2", email: "rami.daher@example.com" }, 201));
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");
    await waitFor(() => expect(emailField()).toHaveValue(""));
    fillAndSend("rami.daher@example.com");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "rami.daher@example.com" });
  });
});

describe("AC3: an invalid email, or one already in use, gets a clear message", () => {
  it("asks for an email when the field is empty, and sends nothing", async () => {
    const fetchMock = stubFetch();
    render(<HeadOfTransportPage />);

    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(emailField()).toHaveAccessibleDescription("Email is required"));
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["not-an-email", "missing-at.example.com", "no-domain@", "two@@example.com", "with space@example.com"])(
    "rejects %s with a message, and sends nothing",
    async (bad) => {
      const fetchMock = stubFetch();
      render(<HeadOfTransportPage />);

      fillAndSend(bad);

      await waitFor(() => expect(emailField()).toHaveAccessibleDescription("Enter a valid email address"));
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("shows the backend's message next to the field when the email is already in use, and keeps what was typed", async () => {
    stubFetch(json({ title: "Email already in use", errors: { email: "An account with this email already exists." } }, 409));
    render(<HeadOfTransportPage />);

    fillAndSend("taken@example.com");

    await waitFor(() => expect(emailField()).toHaveAccessibleDescription("An account with this email already exists."));
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveValue("taken@example.com");
    expect(screen.queryByText("Invite sent.")).not.toBeInTheDocument();
  });

  it("shows the backend's message when it rejects an email the screen let through (400)", async () => {
    stubFetch(json({ title: "Validation failed", errors: { email: "Email is too long" } }, 400));
    render(<HeadOfTransportPage />);

    fillAndSend("a@b.co");

    await waitFor(() => expect(emailField()).toHaveAccessibleDescription("Email is too long"));
  });

  it("clears the old message once the email is corrected and sent again", async () => {
    stubFetch(
      json({ title: "Email already in use", errors: { email: "An account with this email already exists." } }, 409),
      json(CREATED, 201),
    );
    render(<HeadOfTransportPage />);

    fillAndSend("taken@example.com");
    await waitFor(() => expect(emailField()).toHaveAttribute("aria-invalid", "true"));
    fillAndSend("nour.saad@example.com");

    expect(await screen.findByText("Invite sent.")).toBeInTheDocument();
    expect(emailField()).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("a server error", () => {
  it("tells the user to try again, keeps the email and does not claim success", async () => {
    stubFetch(json({ title: "Internal Server Error" }, 500));
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send the invite. Please try again.");
    expect(emailField()).toHaveValue("nour.saad@example.com");
    expect(screen.queryByText("Invite sent.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invite" })).toBeEnabled();
  });

  it("does the same when the network is down", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send the invite. Please try again.");
    expect(emailField()).toHaveValue("nour.saad@example.com");
  });

  it("lets the user try again after a failure", async () => {
    const fetchMock = stubFetch(json({ title: "Internal Server Error" }, 500), json(CREATED, 201));
    render(<HeadOfTransportPage />);

    fillAndSend("nour.saad@example.com");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText("Invite sent.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AC4: only admins can reach the screen", () => {
  function renderInsideAdminArea() {
    render(
      <AdminLayout>
        <p>Invite form lives here</p>
      </AdminLayout>,
    );
  }

  const admin = { id: "u-1", email: "admin@wassel.test", role: "ADMIN" as const };

  it("shows the screen to an admin", async () => {
    vi.mocked(me).mockResolvedValue(admin);
    renderInsideAdminArea();

    expect(await screen.findByText("Invite form lives here")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["HEAD_OF_TRANSPORT", "/head-of-transport"],
    ["DRIVER", "/driver"],
    ["PARENT", "/parent"],
  ] as const)("sends a %s to their own area and never shows the screen", async (role, home) => {
    vi.mocked(me).mockResolvedValue({ ...admin, role });
    renderInsideAdminArea();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(home));
    expect(screen.queryByText("Invite form lives here")).not.toBeInTheDocument();
  });

  it("sends someone who is signed out to the login page", async () => {
    vi.mocked(me).mockRejectedValue(new ApiError(401, "Unauthorized"));
    renderInsideAdminArea();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Invite form lives here")).not.toBeInTheDocument();
  });

  it("shows nothing of the screen while it is still finding out who is signed in", () => {
    vi.mocked(me).mockReturnValue(new Promise(() => {}));
    renderInsideAdminArea();

    expect(screen.queryByText("Invite form lives here")).not.toBeInTheDocument();
  });
});

describe("AC5: reachable from a card on the admin home", () => {
  it("has a Head of transportation card that links to the invite screen", () => {
    render(<AdminHome />);

    const link = screen.getByRole("link", { name: /Head of transportation/ });
    expect(link).toHaveAttribute("href", "/admin/head-of-transport");
  });

  it("keeps the other admin cards", () => {
    render(<AdminHome />);

    expect(screen.getByRole("link", { name: /School times/ })).toHaveAttribute("href", "/admin/school-times");
    expect(screen.getByRole("link", { name: /School calendar/ })).toHaveAttribute("href", "/admin/calendar");
  });

  it("also has a link to it in the admin navigation", async () => {
    vi.mocked(me).mockResolvedValue({ id: "u-1", email: "admin@wassel.test", role: "ADMIN" });
    render(
      <AdminLayout>
        <p>content</p>
      </AdminLayout>,
    );

    await screen.findByText("content");
    expect(screen.getAllByRole("link", { name: /Head of transportation/ })[0]).toHaveAttribute(
      "href",
      "/admin/head-of-transport",
    );
  });
});
