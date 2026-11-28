// Who the head may pick as a run's replacement driver (SCRUM-274). There is no eligible-drivers endpoint,
// so this combines GET /drivers and GET /routes: active drivers, minus every driver already on a route (a
// driver is on at most one), minus the run's current driver.
//
// A hint only: the server still decides. Between these reads and the POST, a driver can be revoked or put
// on a route by someone else, and the reassignment then answers 409 with errors.driverId (see
// reassignFailure in useReassign.ts), after which the panel reloads this list.

import type { Driver } from "@/lib/api/drivers";
import type { RouteSummary } from "@/lib/api/routes";

export function eligibleDrivers(
  drivers: readonly Driver[],
  routes: readonly RouteSummary[],
  currentDriverId: string,
): Driver[] {
  const onARoute = new Set(routes.map((route) => route.driver.id));
  return drivers.filter(
    (driver) => driver.status === "active" && !onARoute.has(driver.id) && driver.id !== currentDriverId,
  );
}
