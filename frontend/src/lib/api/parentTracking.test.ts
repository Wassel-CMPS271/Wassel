import { afterEach, expect, it, vi } from "vitest";
import { getBusLocation, parseBusLocation } from "./parentTracking";
afterEach(() => vi.unstubAllGlobals());
const position = { latitude: 0, longitude: 0, accuracyMeters: 0, receivedAt: "2026-11-09T07:00:00Z", ageSeconds: 0 };
it("uses only the authenticated, encoded child endpoint", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "LIVE", position })));
  vi.stubGlobal("fetch", fetcher);
  expect((await getBusLocation("child/a")).position).toEqual(position);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/children/child%2Fa/bus-location"), expect.objectContaining({ credentials: "include", method: "GET" }));
});
it.each([401, 403, 404, 500])("preserves HTTP %s and supplies no fake location", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
  await expect(getBusLocation("a")).rejects.toMatchObject({ status });
});
it("keeps UNAVAILABLE distinct from a coordinate at zero", () => {
  expect(parseBusLocation({ status: "UNAVAILABLE", position: null }).position).toBeNull();
  expect(parseBusLocation({ status: "LIVE", position }).position?.latitude).toBe(0);
});
it.each([
  null, {}, { status: "LIVE", position: null }, { status: "UNAVAILABLE", position },
  { status: "LIVE", position: { ...position, latitude: 91 } },
  { status: "LIVE", position: { ...position, ageSeconds: 61 } },
  { status: "STALE", position: { ...position, ageSeconds: 301 } },
  { status: "LIVE", position: { ...position, receivedAt: "bad" } },
])("rejects inconsistent GPS payload %j", value => expect(() => parseBusLocation(value)).toThrow());
