"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import {
  addDriver,
  assignDriverToVehicle,
  getDrivers,
  resendInvite,
  unassignDriver,
  type Driver,
  type NewDriver,
} from "@/lib/api/drivers";
import { getVehicles, type Vehicle } from "@/lib/api/vehicles";
import { AddDriverForm } from "./AddDriverForm";
import { DriverListItem } from "./DriverListItem";
import { DriverListSkeleton } from "./DriverListSkeleton";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { DriverIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const loadDrivers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [driversData, vehiclesData] = await Promise.all([getDrivers(), getVehicles()]);
      setDrivers(driversData);
      setVehicles(vehiclesData);
      setLoadError(undefined);
    } catch {
      const message = "Couldn't load drivers. Please try again.";
      setLoadError(message);
      pushToast(message);
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  const vehiclePlatesById = vehicles.reduce<Record<string, string>>((byId, vehicle) => {
    byId[vehicle.id] = vehicle.plateNumber;
    return byId;
  }, {});

  // Unassigned, active vehicles — the same eligible set for every driver's
  // picker. A driver's own current vehicle is "taken" by them, so it's
  // already excluded here, which is exactly what the reassign picker needs.
  const assignedVehicleIds = new Set(
    drivers.map((driver) => driver.assignedVehicleId).filter((id): id is string => id !== null),
  );
  const eligibleVehicles = vehicles.filter(
    (vehicle) => vehicle.isActive && !assignedVehicleIds.has(vehicle.id),
  );

  async function handleAdd(data: NewDriver) {
    const driver = await addDriver(data);
    setDrivers((prev) => [...prev, driver]);
    pushToast(`${driver.firstName} ${driver.lastName} invited.`);
  }

  async function handleResendInvite(id: string) {
    try {
      const updated = await resendInvite(id);
      setDrivers((prev) => prev.map((driver) => (driver.id === id ? updated : driver)));
      pushToast(`Invite resent to ${updated.firstName} ${updated.lastName}.`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Couldn't resend the invite. Please try again.");
    }
  }

  async function handleAssign(driverId: string, vehicleId: string) {
    try {
      const updated = await assignDriverToVehicle(driverId, vehicleId);
      setDrivers((prev) => prev.map((driver) => (driver.id === driverId ? updated : driver)));
      const plate = vehiclePlatesById[vehicleId] ?? vehicleId;
      pushToast(`${updated.firstName} ${updated.lastName} assigned to ${plate}.`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Couldn't assign the vehicle. Please try again.");
    }
  }

  async function handleUnassign(driverId: string) {
    try {
      const updated = await unassignDriver(driverId);
      setDrivers((prev) => prev.map((driver) => (driver.id === driverId ? updated : driver)));
      pushToast(`${updated.firstName} ${updated.lastName} unassigned.`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Couldn't unassign the driver. Please try again.");
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "768px" }}
      >
        <header className="flex items-start justify-between flex-wrap" style={{ gap: spacing.md }}>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
              Drivers
            </h1>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              View your driver roster and see which vehicle each one is assigned to.
            </p>
          </div>
          <AddDriverForm onAdd={handleAdd} />
        </header>

        <section aria-labelledby="driver-list-heading">
          <div className="flex items-center" style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
              style={{ width: "24px", height: "24px", backgroundColor: "rgba(18, 183, 106, 0.14)" }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" fill={colors.success[500]} />
                <circle cx="7" cy="7" r="5" stroke={colors.success[500]} strokeOpacity="0.5" fill="none" />
              </svg>
            </span>
            <h2
              id="driver-list-heading"
              className="text-lg font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              Roster
            </h2>
          </div>
          <div
            aria-hidden="true"
            style={{
              height: "1px",
              background: `linear-gradient(90deg, ${darkTheme.surface.cardBorder}, transparent)`,
              marginBottom: spacing.md,
            }}
          />

          {isLoading && (
            <>
              <span className="sr-only" role="status">
                Loading drivers…
              </span>
              <DriverListSkeleton />
            </>
          )}

          {loadError && (
            <p role="alert" style={{ color: colors.error[500] }}>
              {loadError}
            </p>
          )}

          {!isLoading && !loadError && drivers.length === 0 && (
            <div
              className="flex flex-col items-center text-center"
              style={{
                padding: spacing.xl,
                border: `1px dashed ${darkTheme.surface.cardBorder}`,
                borderRadius: radius.lg,
                backgroundColor: "rgba(20, 22, 29, 0.5)",
              }}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: radius.full,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: darkTheme.text.muted,
                  marginBottom: spacing.md,
                }}
              >
                <DriverIcon size={24} />
              </span>
              <p
                className="text-sm font-medium"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                No drivers yet
              </p>
              <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: "320px" }}>
                Drivers will show up here once they&apos;ve been added.
              </p>
            </div>
          )}

          {!isLoading && !loadError && drivers.length > 0 && (
            <ul
              role="list"
              className="flex flex-col"
              style={{ gap: spacing.sm, padding: 0, margin: 0 }}
            >
              <AnimatePresence initial={false}>
                {drivers.map((driver) => (
                  <DriverListItem
                    key={driver.id}
                    driver={driver}
                    assignedVehiclePlate={
                      driver.assignedVehicleId
                        ? vehiclePlatesById[driver.assignedVehicleId]
                        : undefined
                    }
                    eligibleVehicles={eligibleVehicles}
                    onResendInvite={handleResendInvite}
                    onAssign={handleAssign}
                    onUnassign={handleUnassign}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
