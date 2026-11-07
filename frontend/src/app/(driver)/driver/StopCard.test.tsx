import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RunStop } from "@/lib/api/runs";
import { StopCard } from "./StopCard";

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
};

function renderCard(stop: RunStop) {
  render(
    <ul>
      <StopCard
        stop={stop}
        state="pending"
        index={0}
        actions={[]}
        pendingStatus={null}
        error={null}
        onConfirm={() => {}}
        onRetry={() => {}}
      />
    </ul>,
  );
}

it("renders both links with the correct href and accessible labels when lat/lng and phone are present", () => {
  renderCard(BASE_STOP);

  const mapsLink = screen.getByRole("link", { name: "Open directions to Dana Fares's stop" });
  expect(mapsLink).toHaveAttribute(
    "href",
    "https://www.google.com/maps/dir/?api=1&destination=33.895,35.478",
  );

  const callLink = screen.getByRole("link", { name: "Call Dana Fares's parent" });
  expect(callLink).toHaveAttribute("href", "tel:+96170123456");
});

it("hides the maps link when latitude and longitude are null", () => {
  renderCard({ ...BASE_STOP, latitude: null, longitude: null });

  expect(
    screen.queryByRole("link", { name: "Open directions to Dana Fares's stop" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Call Dana Fares's parent" })).toBeInTheDocument();
});

it("hides the call link when guardianPhone is blank after trimming", () => {
  renderCard({ ...BASE_STOP, guardianPhone: "   " });

  expect(
    screen.getByRole("link", { name: "Open directions to Dana Fares's stop" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Call Dana Fares's parent" }),
  ).not.toBeInTheDocument();
});

it("hides both links when there is no pin and no phone", () => {
  renderCard({ ...BASE_STOP, latitude: null, longitude: null, guardianPhone: "" });

  expect(
    screen.queryByRole("link", { name: "Open directions to Dana Fares's stop" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Call Dana Fares's parent" }),
  ).not.toBeInTheDocument();
});
