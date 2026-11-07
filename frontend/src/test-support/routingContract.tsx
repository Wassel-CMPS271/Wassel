import { vi } from "vitest";
import type { MapViewProps } from "@/components/map/types";
import type { Route, Stop, Proposal } from "@/lib/api/routes";
import type { Student } from "@/lib/api/students";

export const ROOT = "/api/head-of-transport";
export const ROUTES = `${ROOT}/routes`;
export const RID = "00000229-0000-0000-0000-000000000001";
export const PID = "00000229-0000-0000-0000-000000000002";
export const DETAIL = `${ROUTES}/${RID}`;
export const OPT = `${DETAIL}/optimization`;
export const studentId = (n: number) => `00000229-0000-0000-0001-${String(n).padStart(12, "0")}`;
export function student(n: number, pinned = true): Student {
  return { id: studentId(n), firstName: `Student${n}`, lastName: "Independent", grade: "5",
    guardianName: "Guardian", guardianPhone: "+961 70 229 001", status: "active",
    address: `Pickup ${n}`, latitude: pinned ? 33.88 + n / 1000 : null,
    longitude: pinned ? 35.48 : null, route: null, parentUserId: null, createdAt: "" };
}
export function stop(n: number, position = n): Stop {
  const s = student(n);
  return { studentId: s.id, firstName: s.firstName, lastName: s.lastName, position,
    address: s.address, latitude: s.latitude, longitude: s.longitude, arrivalTime: "07:30" };
}
export function route(count = 3): Route {
  return { id: RID, name: "Independent morning", vehicle: { id: "v229", plateNumber: "T 229", capacity: 14 },
    driver: { id: "d229", firstName: "Independent", lastName: "Driver" }, studentCount: count, seatsLeft: 14 - count,
    school: { latitude: 33.896, longitude: 35.484, arrivalTime: "08:00" },
    stops: Array.from({ length: count }, (_, i) => stop(i + 1)) };
}
export function proposal(): Proposal {
  return { id: PID, feasible: true, current: { drivingMinutes: 20, stops: route().stops },
    proposed: { drivingMinutes: 12, stops: [stop(3, 1), stop(1, 2), stop(2, 3)] }, reasons: [] };
}
export function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}
export type Handler = (method: string, path: string, body: unknown) => Response | Promise<Response> | undefined;
// Only the HTTP boundary is replaced. Real API clients, serializers, error parsing,
// components, effects and reconciliation run together. Unexpected calls fail closed.
export function httpFixture(initial = route(), roster = Array.from({ length: 16 }, (_, i) => student(i + 1))) {
  const state = { saved: initial, roster, listed: true, handler: undefined as Handler | undefined };
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, "http://localhost").pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const handled = state.handler?.(method, path, body);
    if (handled !== undefined) return await handled;
    if (method === "GET" && path === ROUTES) return json(state.listed ? [state.saved] : []);
    if (method === "GET" && path === DETAIL) return json(state.saved);
    if (method === "GET" && path === `${ROOT}/students`) return json(state.roster);
    if (method === "GET" && path === `${ROOT}/parents`) return json([]);
    if (method === "GET" && path === `${ROOT}/vehicles`) return json([
      { ...state.saved.vehicle, isActive: true, createdAt: "" },
    ]);
    if (method === "GET" && path === `${ROOT}/drivers`) return json([
      { ...state.saved.driver, status: "active", phone: "", email: "driver@wassel.test", invitedAt: "", assignedVehicleId: null },
    ]);
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { state, calls, fetch, mutations: () => calls.filter(c => c.method !== "GET") };
}

// Browser-only Leaflet adapter. RouteMap and MapView remain real, including
// grouping, ordering, warning text and popup content. Existing Leaflet tests
// exercise its map click, dragging and arrow-key implementation separately.
export function BrowserMap({ markers = [], path = [], school, pin, onPinChange }: MapViewProps) {
  return <div>
    <ol aria-label="Browser markers">{markers.map(m => <li key={m.id} aria-label={m.label}>
      <span>{m.number}</span>{m.popup}
    </li>)}</ol>
    <output aria-label="Browser path">{JSON.stringify(path)}</output>
    {school && <output aria-label="Browser school">{JSON.stringify({ latitude: school.latitude, longitude: school.longitude })}{school.popup}</output>}
    {onPinChange && <>
      <output aria-label="Browser pin">{JSON.stringify(pin)}</output>
      <button type="button" onClick={() => onPinChange(33.901, 35.511)}>Select pickup point</button>
      <button type="button" onClick={() => onPinChange(33.902, 35.512)}>Move pickup point</button>
    </>}
  </div>;
}
