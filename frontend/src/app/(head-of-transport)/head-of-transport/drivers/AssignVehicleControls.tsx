"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { Driver } from "@/lib/api/drivers";
import { darkTheme, radius, spacing, typography } from "@/styles/tokens";

export interface EligibleVehicle {
  id: string;
  plateNumber: string;
}

interface AssignVehicleControlsProps {
  driver: Driver;
  eligibleVehicles: EligibleVehicle[];
  onAssign: (driverId: string, vehicleId: string) => Promise<void>;
  onUnassign: (driverId: string) => Promise<void>;
}

type Mode = "idle" | "picking" | "confirmingReassign" | "confirmingUnassign";

// Mirrors the deactivate-vehicle confirmation pattern in VehicleListItem:
// a trigger button swaps in an inline confirm row, Escape/Cancel returns
// to idle, and focus is restored to the trigger that opened it.
export function AssignVehicleControls({
  driver,
  eligibleVehicles,
  onAssign,
  onUnassign,
}: AssignVehicleControlsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const assignTriggerRef = useRef<HTMLButtonElement>(null);
  const unassignTriggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const confirmReassignRef = useRef<HTMLButtonElement>(null);
  const confirmUnassignRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreAssignFocusRef = useRef(false);
  const shouldRestoreUnassignFocusRef = useRef(false);

  const isAssigned = driver.assignedVehicleId !== null;
  const selectedVehicle = eligibleVehicles.find((vehicle) => vehicle.id === selectedVehicleId);

  useEffect(() => {
    if (mode === "picking") selectRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === "confirmingReassign") confirmReassignRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === "confirmingUnassign") confirmUnassignRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === "idle" && shouldRestoreAssignFocusRef.current) {
      shouldRestoreAssignFocusRef.current = false;
      assignTriggerRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "idle" && shouldRestoreUnassignFocusRef.current) {
      shouldRestoreUnassignFocusRef.current = false;
      unassignTriggerRef.current?.focus();
    }
  }, [mode]);

  function openPicker() {
    setSelectedVehicleId("");
    setMode("picking");
  }

  function cancelToIdle(which: "assign" | "unassign") {
    if (which === "assign") {
      shouldRestoreAssignFocusRef.current = true;
    } else {
      shouldRestoreUnassignFocusRef.current = true;
    }
    setMode("idle");
    setSelectedVehicleId("");
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelToIdle("assign");
    }
  }

  function handleReassignConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelToIdle("assign");
    }
  }

  function handleUnassignConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelToIdle("unassign");
    }
  }

  async function performAssign(vehicleId: string) {
    setIsSaving(true);
    try {
      await onAssign(driver.id, vehicleId);
      shouldRestoreAssignFocusRef.current = true;
      setMode("idle");
      setSelectedVehicleId("");
    } finally {
      setIsSaving(false);
    }
  }

  function handleChooseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicleId) return;
    if (isAssigned) {
      // Reassigning moves the driver off their current vehicle — confirm first.
      setMode("confirmingReassign");
    } else {
      void performAssign(selectedVehicleId);
    }
  }

  async function handleConfirmReassign() {
    await performAssign(selectedVehicleId);
  }

  async function handleConfirmUnassign() {
    setIsSaving(true);
    try {
      await onUnassign(driver.id);
      // The Unassign button unmounts once the driver is unassigned — the
      // "Assign vehicle" button takes its place, so focus goes there
      // instead (mirrors Reactivate taking Deactivate's place in
      // VehicleListItem).
      shouldRestoreAssignFocusRef.current = true;
      setMode("idle");
    } finally {
      setIsSaving(false);
    }
  }

  if (mode === "picking") {
    return (
      <form
        onSubmit={handleChooseSubmit}
        onKeyDown={handlePickerKeyDown}
        className="flex items-end flex-wrap"
        style={{ gap: spacing.sm }}
      >
        <div className="flex flex-col" style={{ gap: spacing.xs }}>
          <label
            htmlFor={`vehicle-picker-${driver.id}`}
            className="text-sm font-medium"
            style={{ color: darkTheme.text.secondary }}
          >
            {isAssigned ? "Reassign to" : "Assign to"}
          </label>
          <select
            ref={selectRef}
            id={`vehicle-picker-${driver.id}`}
            value={selectedVehicleId}
            onChange={(event) => setSelectedVehicleId(event.target.value)}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderRadius: radius.md,
              padding: `${spacing.sm} ${spacing.md}`,
              border: `1px solid ${darkTheme.surface.inputBorder}`,
              backgroundColor: darkTheme.surface.input,
              color: darkTheme.text.primary,
              fontFamily: typography.fontFamily.serif,
            }}
          >
            <option value="" disabled>
              Select a vehicle
            </option>
            {eligibleVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!selectedVehicleId || isSaving}>
          {isAssigned ? "Continue" : isSaving ? "Assigning..." : "Assign"}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => cancelToIdle("assign")}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </form>
    );
  }

  if (mode === "confirmingReassign") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center flex-wrap"
        style={{ gap: spacing.xs }}
        onKeyDown={handleReassignConfirmKeyDown}
      >
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          Move {driver.firstName} to {selectedVehicle?.plateNumber}? This unassigns them from their
          current vehicle.
        </span>
        <Button
          ref={confirmReassignRef}
          variant="primary"
          onClick={handleConfirmReassign}
          disabled={isSaving}
        >
          {isSaving ? "Moving..." : "Confirm"}
        </Button>
        <Button variant="ghost" onClick={() => cancelToIdle("assign")} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    );
  }

  if (mode === "confirmingUnassign") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center flex-wrap"
        style={{ gap: spacing.xs }}
        onKeyDown={handleUnassignConfirmKeyDown}
      >
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          Unassign {driver.firstName}?
        </span>
        <Button
          ref={confirmUnassignRef}
          variant="danger"
          onClick={handleConfirmUnassign}
          disabled={isSaving}
        >
          {isSaving ? "Unassigning..." : "Confirm"}
        </Button>
        <Button variant="ghost" onClick={() => cancelToIdle("unassign")} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center flex-wrap" style={{ gap: spacing.xs }}>
      <Button
        ref={assignTriggerRef}
        variant="secondary"
        onClick={openPicker}
        disabled={eligibleVehicles.length === 0}
        title={eligibleVehicles.length === 0 ? "No unassigned, active vehicles available" : undefined}
        aria-label={`${isAssigned ? "Reassign" : "Assign"} vehicle for ${driver.firstName} ${driver.lastName}`}
      >
        {isAssigned ? "Reassign" : "Assign vehicle"}
      </Button>
      {isAssigned && (
        <Button
          ref={unassignTriggerRef}
          variant="danger"
          onClick={() => setMode("confirmingUnassign")}
          aria-label={`Unassign ${driver.firstName} ${driver.lastName}`}
        >
          Unassign
        </Button>
      )}
    </div>
  );
}
