import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RevokeAccessControl } from "./RevokeAccessControl";

afterEach(() => {
  cleanup();
});

function setup(revoked: boolean, overrides: Partial<{ onRevoke: () => Promise<void>; onRestore: () => Promise<void> }> = {}) {
  const onRevoke = overrides.onRevoke ?? vi.fn().mockResolvedValue(undefined);
  const onRestore = overrides.onRestore ?? vi.fn().mockResolvedValue(undefined);
  render(
    <RevokeAccessControl
      name="Ahmad Khalil"
      shortName="Ahmad"
      revoked={revoked}
      revokeNote="Their vehicle is released."
      onRevoke={onRevoke}
      onRestore={onRestore}
    />,
  );
  return { onRevoke, onRestore };
}

it("shows Revoke access for someone with access, and Restore access for someone revoked", () => {
  setup(false);
  expect(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" })).toHaveTextContent("Revoke access");
  cleanup();
  setup(true);
  expect(screen.getByRole("button", { name: "Restore access for Ahmad Khalil" })).toHaveTextContent("Restore access");
});

it("asks first and sends nothing until Confirm is pressed", async () => {
  const { onRevoke } = setup(false);

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));

  expect(screen.getByRole("status")).toHaveTextContent("Revoke access for Ahmad?");
  expect(screen.getByRole("status")).toHaveTextContent("Their vehicle is released.");
  expect(onRevoke).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" })).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" }));
  await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("button", { name: "Revoke access for Ahmad Khalil" })).toHaveFocus();
});

it("asks before restoring too, and does not mention the revoke note", async () => {
  const { onRestore, onRevoke } = setup(true);

  fireEvent.click(screen.getByRole("button", { name: "Restore access for Ahmad Khalil" }));

  expect(screen.getByRole("status")).toHaveTextContent("Restore access for Ahmad? They can sign in again.");
  expect(screen.getByRole("status")).not.toHaveTextContent("vehicle");
  expect(onRestore).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Confirm restore access for Ahmad Khalil" }));
  await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
  expect(onRevoke).not.toHaveBeenCalled();
});

it("Cancel and Escape close the question without sending, and return focus to the button", async () => {
  const { onRevoke } = setup(false);

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" })).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
  expect(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" })).toHaveFocus();

  expect(onRevoke).not.toHaveBeenCalled();
});

it("disables both buttons while the call is running and goes back to the button when it ends, even if it failed", async () => {
  let finish: () => void = () => {};
  const onRevoke = vi.fn().mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  setup(false, { onRevoke });

  fireEvent.click(screen.getByRole("button", { name: "Revoke access for Ahmad Khalil" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" }));

  expect(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke access for Ahmad Khalil" }));
  expect(onRevoke).toHaveBeenCalledTimes(1);

  finish();
  expect(await screen.findByRole("button", { name: "Revoke access for Ahmad Khalil" })).toBeEnabled();
});
