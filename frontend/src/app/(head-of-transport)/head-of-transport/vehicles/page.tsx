"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import {
  addVehicle,
  deactivateVehicle,
  getVehicles,
  reactivateVehicle,
  setVehicleCapacity,
  type NewVehicle,
  type Vehicle,
} from "@/lib/api/vehicles";
import { AddVehicleForm } from "./AddVehicleForm";
import { VehicleListItem } from "./VehicleListItem";
import { VehicleListSkeleton } from "./VehicleListSkeleton";
import { ToastViewport, useToastQueue } from "./Toast";
import { VehicleIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const loadVehicles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getVehicles();
      setVehicles(data);
      setLoadError(undefined);
    } catch {
      setLoadError("Couldn't load vehicles. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  async function handleAdd(data: NewVehicle) {
    const vehicle = await addVehicle(data);
    setVehicles((prev) => [...prev, vehicle]);
    pushToast(`${vehicle.plateNumber} added to your fleet.`);
  }

  async function handleSetCapacity(id: string, capacity: number) {
    const updated = await setVehicleCapacity(id, capacity);
    setVehicles((prev) => prev.map((vehicle) => (vehicle.id === id ? updated : vehicle)));
    pushToast(`Capacity updated for ${updated.plateNumber}.`);
  }

  async function handleDeactivate(id: string) {
    const updated = await deactivateVehicle(id);
    setVehicles((prev) => prev.map((vehicle) => (vehicle.id === id ? updated : vehicle)));
    pushToast(`${updated.plateNumber} deactivated.`);
  }

  async function handleReactivate(id: string) {
    const updated = await reactivateVehicle(id);
    setVehicles((prev) => prev.map((vehicle) => (vehicle.id === id ? updated : vehicle)));
    pushToast(`${updated.plateNumber} reactivated.`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: "768px" }}
      >
        <header>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Vehicles
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Manage the vehicles available to your transport routes.
          </p>
        </header>

        <AddVehicleForm onAdd={handleAdd} />

        <section aria-labelledby="vehicle-list-heading">
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
              id="vehicle-list-heading"
              className="text-lg font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              Fleet
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
                Loading vehicles…
              </span>
              <VehicleListSkeleton />
            </>
          )}

          {loadError && (
            <p role="alert" style={{ color: colors.error[500] }}>
              {loadError}
            </p>
          )}

          {!isLoading && !loadError && vehicles.length === 0 && (
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
                <VehicleIcon size={24} />
              </span>
              <p
                className="text-sm font-medium"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                No vehicles yet
              </p>
              <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: "320px" }}>
                Add your first vehicle using the form above to start building your fleet.
              </p>
            </div>
          )}

          {!isLoading && !loadError && vehicles.length > 0 && (
            <ul
              role="list"
              className="flex flex-col"
              style={{ gap: spacing.sm, padding: 0, margin: 0 }}
            >
              <AnimatePresence initial={false}>
                {vehicles.map((vehicle) => (
                  <VehicleListItem
                    key={vehicle.id}
                    vehicle={vehicle}
                    onSetCapacity={handleSetCapacity}
                    onDeactivate={handleDeactivate}
                    onReactivate={handleReactivate}
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
