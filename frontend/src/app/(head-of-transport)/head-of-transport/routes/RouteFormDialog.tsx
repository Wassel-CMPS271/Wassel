"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getDrivers, type Driver } from "@/lib/api/drivers";
import { ApiValidationError } from "@/lib/api/errors";
import type { RouteDriver, RouteInput, RouteVehicle } from "@/lib/api/routes";
import { getVehicles, type Vehicle } from "@/lib/api/vehicles";
import { colors, darkTheme, sizing, spacing } from "@/styles/tokens";

const FIELDS = ["name", "vehicleId", "driverId"] as const;
type Field = (typeof FIELDS)[number];
type FormErrors = Partial<Record<Field | "form", string>>;

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface RouteFormDialogProps {
  title: string;
  submitLabel: string;
  submittingLabel: string;
  initial: RouteInput;
  // The route's own vehicle and driver (edit only). They stay selectable even
  // when no longer active, so the fields aren't blank and saving unchanged
  // still shows the backend's message for them.
  current?: { vehicle: RouteVehicle; driver: RouteDriver };
  onSubmit: (data: RouteInput) => Promise<void>;
  onClose: () => void;
}

// The create/edit route dialog. Mounted only while open (inside the caller's
// AnimatePresence), so each opening starts from `initial` with fresh options.
export function RouteFormDialog({
  title,
  submitLabel,
  submittingLabel,
  initial,
  current,
  onSubmit,
  onClose,
}: RouteFormDialogProps) {
  const [name, setName] = useState(initial.name);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId);
  const [driverId, setDriverId] = useState(initial.driverId);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRefs = {
    name: useRef<HTMLInputElement>(null),
    vehicleId: useRef<HTMLSelectElement>(null),
    driverId: useRef<HTMLSelectElement>(null),
  };

  useEffect(() => {
    fieldRefs.name.current?.focus();
    // Focus once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getVehicles(), getDrivers()])
      .then(([vehicleList, driverList]) => {
        if (cancelled) return;
        setVehicles(vehicleList);
        setDrivers(driverList);
      })
      .catch(() => {
        if (cancelled) return;
        setErrors((prev) => ({
          ...prev,
          form: "Couldn't load vehicles and drivers. Close this and try again.",
        }));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive);
  const activeDrivers = drivers.filter((driver) => driver.status === "active");
  const showCurrentVehicle =
    current && !activeVehicles.some((vehicle) => vehicle.id === current.vehicle.id);
  const showCurrentDriver =
    current && !activeDrivers.some((driver) => driver.id === current.driver.id);

  // Shows the errors and moves focus to the first field that has one.
  function showErrors(next: FormErrors) {
    setErrors(next);
    const firstInvalid = FIELDS.find((field) => next[field]);
    if (firstInvalid) fieldRefs[firstInvalid].current?.focus();
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!vehicleId) next.vehicleId = "Vehicle is required.";
    if (!driverId) next.driverId = "Driver is required.";
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      showErrors(clientErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), vehicleId, driverId });
      onClose();
    } catch (err) {
      const fieldErrors: FormErrors = {};
      if (err instanceof ApiValidationError) {
        for (const field of FIELDS) {
          if (err.errors[field]) fieldErrors[field] = err.errors[field];
        }
      }
      // A message for a field this form doesn't have would otherwise vanish.
      showErrors(Object.keys(fieldErrors).length > 0 ? fieldErrors : { form: GENERIC_ERROR });
      setIsSubmitting(false);
    }
  }

  // Escape closes the dialog (not mid-save); Tab is trapped to the enabled
  // controls inside the panel so focus can't leave it while it's open.
  function handleOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isSubmitting) onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: darkTheme.surface.overlay, padding: spacing.lg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onKeyDown={handleOverlayKeyDown}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full"
        style={{ maxWidth: sizing.dialogMaxWidth }}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Card>
          <form onSubmit={handleSubmit} noValidate aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="text-lg font-semibold"
              style={{ marginBottom: spacing.md, color: darkTheme.text.primary }}
            >
              {title}
            </h2>
            <div className="flex flex-col" style={{ gap: spacing.md }}>
              <Input
                ref={fieldRefs.name}
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={errors.name}
                placeholder="e.g. Hamra Morning"
              />
              <Select
                ref={fieldRefs.vehicleId}
                label="Vehicle"
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                error={errors.vehicleId}
                disabled={isLoadingOptions}
              >
                <option value="" disabled>
                  {isLoadingOptions ? "Loading vehicles..." : "Select a vehicle"}
                </option>
                {showCurrentVehicle && (
                  <option value={current.vehicle.id}>{current.vehicle.plateNumber}</option>
                )}
                {activeVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber}
                  </option>
                ))}
              </Select>
              <Select
                ref={fieldRefs.driverId}
                label="Driver"
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
                error={errors.driverId}
                disabled={isLoadingOptions}
              >
                <option value="" disabled>
                  {isLoadingOptions ? "Loading drivers..." : "Select a driver"}
                </option>
                {showCurrentDriver && (
                  <option value={current.driver.id}>
                    {current.driver.firstName} {current.driver.lastName}
                  </option>
                )}
                {activeDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.firstName} {driver.lastName}
                  </option>
                ))}
              </Select>
            </div>

            {errors.form && (
              <p
                role="alert"
                className="text-sm"
                style={{ color: colors.error[500], marginTop: spacing.md }}
              >
                {errors.form}
              </p>
            )}

            <div className="flex" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Button type="submit" disabled={isSubmitting || isLoadingOptions}>
                {isSubmitting ? submittingLabel : submitLabel}
              </Button>
              <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  );
}
