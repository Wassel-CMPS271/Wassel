import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ConfirmationStatus, RunStop } from "@/lib/api/runs";
import type { QueueItem, QueueItemState } from "@/lib/offline/queue";
import { StopCard, type StopCardProps } from "./StopCard";

afterEach(() => {
  cleanup();
});

const BASE_STOP: RunStop = {
  studentId: "s1",
  position: 1,
  firstName: "Dana",
  lastName: "Fares",
  address: "Hamra Street",
  latitude: 33.895,
  longitude: 35.478,
  arrivalTime: "07:15",
  guardianName: "Rana Fares",
  guardianPhone: "+96170123456",
  absent: false,
  confirmation: null,
  removedFromRoute: false,
};

const BASE_PROPS: StopCardProps = {
  stop: BASE_STOP,
  state: "pending",
  index: 0,
  actions: [],
  pendingStatus: null,
  error: null,
  onConfirm: () => {},
  onRetry: () => {},
};

function renderCard(props: Partial<StopCardProps> & { stop?: RunStop } = {}) {
  return render(
    <ul>
      <StopCard {...BASE_PROPS} {...props} />
    </ul>,
  );
}

function queueItem(overrides: Partial<QueueItem> & { state: QueueItemState }): QueueItem {
  return {
    id: "q-1",
    clientRequestId: "k-1",
    runId: "run-1",
    runDate: "2026-11-09",
    studentId: "s1",
    status: "PICKED_UP" as ConfirmationStatus,
    occurredAt: "2026-11-09T14:32:00.000Z",
    createdAt: 0,
    attempts: 1,
    ...overrides,
  };
}

it("renders both links with the correct href and accessible labels when lat/lng and phone are present", () => {
  renderCard({ stop: BASE_STOP });

  const mapsLink = screen.getByRole("link", { name: "Open directions to Dana Fares's stop" });
  expect(mapsLink).toHaveAttribute(
    "href",
    "https://www.google.com/maps/dir/?api=1&destination=33.895,35.478",
  );

  const callLink = screen.getByRole("link", { name: "Call Dana Fares's parent" });
  expect(callLink).toHaveAttribute("href", "tel:+96170123456");
});

it("hides the maps link when latitude and longitude are null", () => {
  renderCard({ stop: { ...BASE_STOP, latitude: null, longitude: null } });

  expect(
    screen.queryByRole("link", { name: "Open directions to Dana Fares's stop" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Call Dana Fares's parent" })).toBeInTheDocument();
});

it("hides the call link when guardianPhone is blank after trimming", () => {
  renderCard({ stop: { ...BASE_STOP, guardianPhone: "   " } });

  expect(
    screen.getByRole("link", { name: "Open directions to Dana Fares's stop" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Call Dana Fares's parent" }),
  ).not.toBeInTheDocument();
});

it("hides both links when there is no pin and no phone", () => {
  renderCard({ stop: { ...BASE_STOP, latitude: null, longitude: null, guardianPhone: "" } });

  expect(
    screen.queryByRole("link", { name: "Open directions to Dana Fares's stop" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Call Dana Fares's parent" }),
  ).not.toBeInTheDocument();
});

function card() {
  return screen.getByText("Dana Fares").closest("li")!;
}

it("shows nothing extra with no queue item (confirmationReplayApi is null, or fully synced and pruned)", () => {
  renderCard({ actions: ["PICKED_UP", "NOT_PRESENT"], queueItem: null });

  expect(within(card()).queryByText(/Saved on phone|Sending|Sent|Conflict|Couldn't send/)).not
    .toBeInTheDocument();
});

it("shows a Saved on phone pill with the local tap time for a queued item", () => {
  renderCard({ queueItem: queueItem({ state: "queued", status: "DROPPED_OFF" }) });

  const group = within(card()).getByRole("group", { name: "Confirm Dana Fares" });
  expect(within(group).getByText(/Saved on phone/)).toBeInTheDocument();
  expect(within(group).getByText(/Dropped off/)).toBeInTheDocument();
  // The exact hour depends on the test runner's own timezone (occurredAt is
  // UTC); only the label and that some time was shown are checked here.
  expect(within(group).getByText(/\(local time\)/)).toBeInTheDocument();
  expect(within(group).getByText(/\d{1,2}:\d{2}\s?[AP]M/i)).toBeInTheDocument();
  expect(within(group).queryByRole("button")).not.toBeInTheDocument();
});

it("shows Sending and disables the confirm buttons while a queue item is in flight", () => {
  renderCard({
    actions: ["DROPPED_OFF"],
    queueItem: queueItem({ state: "sending", status: "PICKED_UP" }),
  });

  expect(within(card()).getByText(/Sending…/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dropped off" })).toBeDisabled();
});

it("shows a Sent pill with a check for a synced item", () => {
  renderCard({ queueItem: queueItem({ state: "synced", status: "NOT_PRESENT" }) });

  const pill = within(card()).getByText(/Sent/).closest("span")!;
  expect(pill).toBeInTheDocument();
  expect(within(card()).queryByRole("button")).not.toBeInTheDocument();
});

it("shows Couldn't send with Try again for an error item, and calls onRetryQueueItem", () => {
  const onRetryQueueItem = vi.fn();
  renderCard({
    queueItem: queueItem({ state: "error", lastError: { kind: "retryable", message: "x" } }),
    onRetryQueueItem,
  });

  expect(within(card()).getByText(/Couldn't send/)).toBeInTheDocument();
  fireEvent.click(within(card()).getByRole("button", { name: "Try again" }));

  expect(onRetryQueueItem).toHaveBeenCalledTimes(1);
});

it("shows Waiting to send with Try again for a blocked item", () => {
  const onRetryQueueItem = vi.fn();
  renderCard({ queueItem: queueItem({ state: "blocked" }), onRetryQueueItem });

  expect(within(card()).getByText(/Waiting to send/)).toBeInTheDocument();
  fireEvent.click(within(card()).getByRole("button", { name: "Try again" }));

  expect(onRetryQueueItem).toHaveBeenCalledTimes(1);
});

it("shows Conflict with the server's detail, and Dismiss behind a confirm step", () => {
  const onDismissQueueItem = vi.fn();
  renderCard({
    queueItem: queueItem({
      state: "conflict",
      lastError: { kind: "conflict", message: "Dana is not on this run" },
    }),
    onDismissQueueItem,
  });

  expect(within(card()).getByText(/Conflict/)).toBeInTheDocument();
  expect(within(card()).getByText("Dana is not on this run")).toBeInTheDocument();
  expect(within(card()).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

  fireEvent.click(within(card()).getByRole("button", { name: "Dismiss" }));
  expect(onDismissQueueItem).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
  expect(onDismissQueueItem).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(onDismissQueueItem).toHaveBeenCalledTimes(1);
});

it("cancels the Dismiss confirm step on Escape", () => {
  renderCard({ queueItem: queueItem({ state: "conflict", lastError: { kind: "conflict", message: "x" } }) });

  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Confirm" }), { key: "Escape" });

  expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
});

it("moves focus to Try again once a queue item settles from sending to error", () => {
  const { rerender } = render(
    <ul>
      <StopCard
        {...BASE_PROPS}
        actions={["DROPPED_OFF"]}
        queueItem={queueItem({ state: "sending", status: "PICKED_UP" })}
      />
    </ul>,
  );
  screen.getByRole("button", { name: "Dropped off" }).focus();

  rerender(
    <ul>
      <StopCard
        {...BASE_PROPS}
        actions={["DROPPED_OFF"]}
        queueItem={queueItem({
          state: "error",
          status: "PICKED_UP",
          lastError: { kind: "retryable", message: "x" },
        })}
      />
    </ul>,
  );

  expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
});
