"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { DriverIcon } from "@/components/ui/icons";
import type { RouteInput, RouteSummary } from "@/lib/api/routes";
import { EditRouteForm } from "./EditRouteForm";
import { colors, darkTheme, spacing } from "@/styles/tokens";

interface RouteListItemProps {
  route: RouteSummary;
  onEdit: (routeId: string, data: RouteInput) => Promise<void>;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function RouteListItem({ route, onEdit }: RouteListItemProps) {
  const driverName = `${route.driver.firstName} ${route.driver.lastName}`;
  const isOverCapacity = route.seatsLeft < 0;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="list-none"
    >
      <Card
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
        style={{ gap: spacing.md }}
      >
        <div className="flex flex-col min-w-0" style={{ gap: spacing.xs }}>
          <h3 className="text-base font-semibold">
            <Link
              href={`/head-of-transport/routes/${route.id}`}
              className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 hover:underline"
              style={{ color: darkTheme.text.primary, outlineColor: colors.primary[400] }}
            >
              {route.name}
            </Link>
          </h3>
          <div className="flex items-center flex-wrap" style={{ gap: spacing.sm }}>
            <LicensePlate plateNumber={route.vehicle.plateNumber} />
            <span
              className="flex items-center text-sm"
              style={{ gap: spacing.xs, color: darkTheme.text.secondary }}
            >
              <DriverIcon size={16} />
              {driverName}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start sm:items-end" style={{ gap: spacing.xs }}>
          <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
            {plural(route.studentCount, "student")}
          </span>
          {/* Not role="alert": it isn't news, and every over-capacity row would be
              announced on page load. Error red on surface.card is ~4.8:1. */}
          {isOverCapacity ? (
            <span className="text-sm font-medium" style={{ color: colors.error[500] }}>
              {`Over capacity by ${plural(-route.seatsLeft, "seat")}`}
            </span>
          ) : (
            <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
              {`${plural(route.seatsLeft, "seat")} left`}
            </span>
          )}
          <EditRouteForm route={route} onEdit={onEdit} />
        </div>
      </Card>
    </motion.li>
  );
}
