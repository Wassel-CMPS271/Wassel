"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { AssignVehicleControls, type EligibleVehicle } from "./AssignVehicleControls";
import type { Driver } from "@/lib/api/drivers";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

interface DriverListItemProps {
  driver: Driver;
  assignedVehiclePlate?: string;
  eligibleVehicles: EligibleVehicle[];
  onResendInvite: (id: string) => Promise<void>;
  onAssign: (driverId: string, vehicleId: string) => Promise<void>;
  onUnassign: (driverId: string) => Promise<void>;
}

const GLOW_REST = "0 0 0px 0px rgba(18, 183, 106, 0)";
const GLOW_PEAK = "0 0 12px 4px rgba(18, 183, 106, 0.55)";
const GLOW_STATIC = "0 0 8px 2px rgba(18, 183, 106, 0.45)";

const STATUS_CONFIG: Record<Driver["status"], { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: darkTheme.status.activeDot, text: colors.success[500] },
  invited: { label: "Invited", dot: colors.warning[500], text: colors.warning[500] },
  deactivated: {
    label: "Deactivated",
    dot: darkTheme.status.inactiveDot,
    text: darkTheme.text.secondary,
  },
};

export function DriverListItem({
  driver,
  assignedVehiclePlate,
  eligibleVehicles,
  onResendInvite,
  onAssign,
  onUnassign,
}: DriverListItemProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isResending, setIsResending] = useState(false);
  const status = STATUS_CONFIG[driver.status];
  const isActive = driver.status === "active";

  async function handleResendInvite() {
    setIsResending(true);
    try {
      await onResendInvite(driver.id);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="list-none flex flex-col sm:flex-row sm:items-center sm:justify-between"
      style={{
        gap: spacing.md,
        padding: spacing.md,
        border: `1px solid ${
          driver.status === "deactivated" ? "rgba(255, 255, 255, 0.05)" : darkTheme.surface.cardBorder
        }`,
        borderRadius: radius.md,
        backgroundColor:
          driver.status === "deactivated" ? "rgba(255, 255, 255, 0.03)" : darkTheme.surface.card,
        boxShadow: driver.status === "deactivated" ? "none" : darkTheme.surface.cardShadow,
      }}
    >
      <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
        <span className="text-base font-medium" style={{ color: darkTheme.text.primary }}>
          {driver.firstName} {driver.lastName}
        </span>
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {driver.phone}
        </span>
        <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
          {driver.email}
        </span>
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
        <div className="flex items-center" style={{ gap: spacing.xs }}>
          <motion.span
            aria-hidden="true"
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: "10px", height: "10px" }}
            animate={{
              backgroundColor: status.dot,
              scale: isActive && !prefersReducedMotion ? [1, 1.4, 1] : 1,
              boxShadow: isActive
                ? prefersReducedMotion
                  ? GLOW_STATIC
                  : [GLOW_REST, GLOW_PEAK, GLOW_REST]
                : GLOW_REST,
            }}
            transition={
              isActive && !prefersReducedMotion
                ? {
                    backgroundColor: { duration: 0.3 },
                    scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                    boxShadow: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                  }
                : { backgroundColor: { duration: 0.3 }, boxShadow: { duration: 0.3 } }
            }
          />
          <span className="text-xs font-medium" style={{ color: status.text }}>
            {status.label}
          </span>
        </div>

        <div className="flex items-center" style={{ gap: spacing.xs }}>
          <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Vehicle:
          </span>
          {assignedVehiclePlate ? (
            <LicensePlate plateNumber={assignedVehiclePlate} />
          ) : (
            <span className="text-sm" style={{ color: darkTheme.text.muted }}>
              Unassigned
            </span>
          )}
        </div>

        {driver.status === "invited" && (
          <Button
            variant="secondary"
            onClick={handleResendInvite}
            disabled={isResending}
            aria-label={`Resend invite to ${driver.firstName} ${driver.lastName}`}
          >
            {isResending ? "Resending..." : "Resend invite"}
          </Button>
        )}

        {driver.status === "active" && (
          <AssignVehicleControls
            driver={driver}
            eligibleVehicles={eligibleVehicles}
            onAssign={onAssign}
            onUnassign={onUnassign}
          />
        )}
      </div>
    </motion.li>
  );
}
