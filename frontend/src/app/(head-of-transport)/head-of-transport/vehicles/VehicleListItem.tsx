"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LicensePlate } from "@/components/ui/LicensePlate";
import type { Vehicle } from "@/lib/api/vehicles";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

interface VehicleListItemProps {
  vehicle: Vehicle;
  onSetCapacity: (id: string, capacity: number) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onReactivate: (id: string) => Promise<void>;
}

const GLOW_REST = "0 0 0px 0px rgba(18, 183, 106, 0)";
const GLOW_PEAK = "0 0 12px 4px rgba(18, 183, 106, 0.55)";
const GLOW_STATIC = "0 0 8px 2px rgba(18, 183, 106, 0.45)";

export function VehicleListItem({
  vehicle,
  onSetCapacity,
  onDeactivate,
  onReactivate,
}: VehicleListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [capacityInput, setCapacityInput] = useState(String(vehicle.capacity));
  const [capacityError, setCapacityError] = useState<string | undefined>();
  const [isConfirmingDeactivate, setIsConfirmingDeactivate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const rowRef = useRef<HTMLLIElement>(null);
  const capacityInputRef = useRef<HTMLInputElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const deactivateTriggerRef = useRef<HTMLButtonElement>(null);
  const reactivateTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Set right before the state change that unmounts the currently
  // focused control, so focus lands somewhere sensible instead of
  // silently falling back to <body>.
  const shouldRestoreEditFocusRef = useRef(false);
  const shouldRestoreDeactivateFocusRef = useRef(false);
  const justDeactivatedRef = useRef(false);
  const justReactivatedRef = useRef(false);

  useEffect(() => {
    if (isEditing) capacityInputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing && shouldRestoreEditFocusRef.current) {
      shouldRestoreEditFocusRef.current = false;
      editTriggerRef.current?.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isConfirmingDeactivate) confirmButtonRef.current?.focus();
  }, [isConfirmingDeactivate]);

  useEffect(() => {
    if (!isConfirmingDeactivate && shouldRestoreDeactivateFocusRef.current) {
      shouldRestoreDeactivateFocusRef.current = false;
      deactivateTriggerRef.current?.focus();
    }
  }, [isConfirmingDeactivate]);

  // The edit/deactivate controls unmount once the vehicle goes
  // inactive, so there's no trigger button left to refocus — move
  // focus to the Reactivate button that takes their place. Fall back
  // to the row itself if it's ever not there.
  useEffect(() => {
    if (!vehicle.isActive && justDeactivatedRef.current) {
      justDeactivatedRef.current = false;
      (reactivateTriggerRef.current ?? rowRef.current)?.focus();
    }
  }, [vehicle.isActive]);

  // Mirror image: reactivating unmounts the Reactivate button and
  // brings back Edit capacity/Deactivate — land on Edit capacity.
  useEffect(() => {
    if (vehicle.isActive && justReactivatedRef.current) {
      justReactivatedRef.current = false;
      (editTriggerRef.current ?? rowRef.current)?.focus();
    }
  }, [vehicle.isActive]);

  async function handleSaveCapacity() {
    const value = Number(capacityInput);
    if (!capacityInput.trim() || !Number.isFinite(value) || value <= 0) {
      setCapacityError("Capacity must be a positive number.");
      return;
    }
    setIsSaving(true);
    try {
      await onSetCapacity(vehicle.id, value);
      shouldRestoreEditFocusRef.current = true;
      setIsEditing(false);
      setCapacityError(undefined);
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEdit() {
    shouldRestoreEditFocusRef.current = true;
    setIsEditing(false);
    setCapacityInput(String(vehicle.capacity));
    setCapacityError(undefined);
  }

  function handleCapacityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSaveCapacity();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  function cancelDeactivateConfirm() {
    shouldRestoreDeactivateFocusRef.current = true;
    setIsConfirmingDeactivate(false);
  }

  async function handleConfirmDeactivate() {
    setIsSaving(true);
    try {
      await onDeactivate(vehicle.id);
      justDeactivatedRef.current = true;
      setIsConfirmingDeactivate(false);
    } finally {
      setIsSaving(false);
    }
  }

  // No confirmation step here — only taking a vehicle out of service
  // (deactivating) is destructive enough to warrant one.
  async function handleReactivate() {
    setIsSaving(true);
    try {
      await onReactivate(vehicle.id);
      justReactivatedRef.current = true;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <motion.li
      ref={rowRef}
      tabIndex={-1}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="list-none flex flex-col sm:flex-row sm:items-center sm:justify-between focus:outline focus:outline-2 focus:outline-offset-2"
      style={{
        gap: spacing.md,
        padding: spacing.md,
        border: `1px solid ${vehicle.isActive ? darkTheme.surface.cardBorder : "rgba(255, 255, 255, 0.05)"}`,
        borderRadius: radius.md,
        backgroundColor: vehicle.isActive ? darkTheme.surface.card : "rgba(255, 255, 255, 0.03)",
        boxShadow: vehicle.isActive ? darkTheme.surface.cardShadow : "none",
        outlineColor: colors.primary[400],
      }}
    >
      <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
        <LicensePlate plateNumber={vehicle.plateNumber} />

        {isEditing ? (
          <div className="flex items-end flex-wrap" style={{ gap: spacing.sm }}>
            <Input
              ref={capacityInputRef}
              label="Capacity"
              type="number"
              min={1}
              value={capacityInput}
              onChange={(event) => setCapacityInput(event.target.value)}
              onKeyDown={handleCapacityKeyDown}
              error={capacityError}
              style={{ maxWidth: "96px" }}
            />
            <Button variant="primary" onClick={handleSaveCapacity} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" onClick={cancelEdit} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        ) : (
          <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Capacity: {vehicle.capacity}
          </span>
        )}
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
        <div className="flex items-center" style={{ gap: spacing.xs }}>
          <motion.span
            aria-hidden="true"
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: "10px", height: "10px" }}
            animate={{
              backgroundColor: vehicle.isActive ? darkTheme.status.activeDot : darkTheme.status.inactiveDot,
              scale: vehicle.isActive && !prefersReducedMotion ? [1, 1.4, 1] : 1,
              boxShadow: vehicle.isActive
                ? prefersReducedMotion
                  ? GLOW_STATIC
                  : [GLOW_REST, GLOW_PEAK, GLOW_REST]
                : GLOW_REST,
            }}
            transition={
              vehicle.isActive && !prefersReducedMotion
                ? {
                    backgroundColor: { duration: 0.3 },
                    scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                    boxShadow: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                  }
                : { backgroundColor: { duration: 0.3 }, boxShadow: { duration: 0.3 } }
            }
          />
          <span
            className="text-xs font-medium transition-colors duration-300"
            style={{ color: vehicle.isActive ? colors.success[500] : darkTheme.text.secondary }}
          >
            {vehicle.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {vehicle.isActive ? (
          !isEditing && (
            <>
              {isConfirmingDeactivate ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center flex-wrap"
                  style={{ gap: spacing.xs }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelDeactivateConfirm();
                    }
                  }}
                >
                  <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
                    Deactivate {vehicle.plateNumber}?
                  </span>
                  <Button
                    ref={confirmButtonRef}
                    variant="danger"
                    onClick={handleConfirmDeactivate}
                    disabled={isSaving}
                    aria-label={`Confirm deactivate ${vehicle.plateNumber}`}
                  >
                    {isSaving ? "Deactivating..." : "Confirm"}
                  </Button>
                  <Button variant="ghost" onClick={cancelDeactivateConfirm} disabled={isSaving}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    ref={editTriggerRef}
                    variant="secondary"
                    onClick={() => setIsEditing(true)}
                    aria-label={`Edit capacity for ${vehicle.plateNumber}`}
                  >
                    Edit capacity
                  </Button>
                  <Button
                    ref={deactivateTriggerRef}
                    variant="danger"
                    onClick={() => setIsConfirmingDeactivate(true)}
                    aria-label={`Deactivate ${vehicle.plateNumber}`}
                  >
                    Deactivate
                  </Button>
                </>
              )}
            </>
          )
        ) : (
          <Button
            ref={reactivateTriggerRef}
            variant="primary"
            onClick={handleReactivate}
            disabled={isSaving}
            aria-label={`Reactivate ${vehicle.plateNumber}`}
          >
            {isSaving ? "Reactivating..." : "Reactivate"}
          </Button>
        )}
      </div>
    </motion.li>
  );
}
