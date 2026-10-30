import { useId } from "react";
import { Card } from "@/components/ui/Card";
import { LicensePlate } from "@/components/ui/LicensePlate";
import { ClockIcon, StudentIcon } from "@/components/ui/icons";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import type { Child } from "@/lib/api/myChildren";
import { colors, darkTheme, iconSize, radius, sizing, spacing } from "@/styles/tokens";

export function ChildTransportCard({ child }: { child: Child }) {
  const titleId = useId();
  const fullName = `${child.firstName} ${child.lastName}`;
  const driver = child.driver;
  const phone = driver?.phone.replace(/[\s().-]/g, "") ?? "";
  const canCall = /^\+?\d{3,15}$/.test(phone);

  return (
    <li className="min-w-0 list-none">
      <Card role="region" aria-labelledby={titleId} className="flex h-full min-w-0 flex-col" style={{ gap: spacing.lg, overflowWrap: "anywhere" }}>
        <header className="flex min-w-0 items-center" style={{ gap: spacing.sm }}>
          <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{ width: sizing.emptyStateBadge, height: sizing.emptyStateBadge, borderRadius: radius.md, backgroundColor: darkTheme.surface.emptyStateBadge, color: colors.primary[300] }}>
            <StudentIcon size={iconSize.md} />
          </span>
          <h2 id={titleId} className="min-w-0 text-xl font-semibold" style={{ color: darkTheme.text.primary }}>{fullName}</h2>
        </header>

        {!child.route ? (
          <div className="flex flex-col" style={{ gap: spacing.sm }}>
            <p className="text-base font-medium" style={{ color: darkTheme.text.primary }}>No route assigned yet</p>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>Your school will share transport details once a route is assigned.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col" style={{ gap: spacing.sm, padding: spacing.md, backgroundColor: darkTheme.surface.recede, borderRadius: radius.md }}>
              <p className="flex items-center text-sm" style={{ gap: spacing.sm, color: darkTheme.text.secondary }}><ClockIcon size={iconSize.sm} />Planned morning pickup</p>
              {child.expectedPickupTime === null ? (
                <p className="text-base font-medium" style={{ color: darkTheme.text.primary }}>Pickup time not available yet</p>
              ) : (
                <time dateTime={child.expectedPickupTime} className="text-3xl font-semibold" style={{ color: darkTheme.text.primary }}>{child.expectedPickupTime}</time>
              )}
              <p className="text-xs" style={{ color: darkTheme.text.secondary }}>School local time · not a live estimate</p>
            </div>

            <dl className="grid min-w-0 grid-cols-1" style={{ gap: spacing.md }}>
              <div><dt className="text-sm" style={{ color: darkTheme.text.secondary }}>Route</dt><dd className="mt-1 text-base font-medium" style={{ color: darkTheme.text.primary }}>{child.route.name}</dd></div>
              <div><dt className="text-sm" style={{ color: darkTheme.text.secondary }}>Driver</dt><dd className="mt-1 text-base font-medium" style={{ color: darkTheme.text.primary }}>{driver?.firstName} {driver?.lastName}</dd><dd className="mt-1 text-sm" style={{ color: darkTheme.text.secondary }}>{driver?.phone.trim() || "Phone number unavailable"}</dd></div>
              <div><dt className="text-sm" style={{ color: darkTheme.text.secondary }}>Vehicle plate</dt><dd className="mt-1 flex min-w-0"><LicensePlate plateNumber={child.vehicle?.plateNumber ?? ""} /></dd></div>
            </dl>

            {canCall ? (
              <a href={`tel:${phone}`} aria-label={`Call driver for ${fullName}`} className={`mt-auto inline-flex w-full items-center justify-center text-sm font-medium ${focusRingClass}`} style={{ ...focusRingStyle, minHeight: sizing.tapTarget, padding: `${spacing.sm} ${spacing.md}`, borderRadius: radius.md, color: darkTheme.text.primary, backgroundColor: colors.primary[600] }}>Call driver</a>
            ) : (
              <p className="mt-auto text-sm" style={{ color: darkTheme.text.secondary }}>Calling is unavailable until your school provides a driver phone number.</p>
            )}
          </>
        )}
      </Card>
    </li>
  );
}
