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

// #153 aef97a3: additive fields on the existing GPS endpoint, not a new API.
const progress = { stopsLeft: 2, plannedTime: "07:18", estimate: { arrivesAt: "2026-10-21T04:21:50Z", secondsAway: 350 } };
it("accepts the agreed live ETA including zero seconds and zero stops", () => {
  expect(parseBusLocation({ status: "LIVE", position, ...progress })).toMatchObject(progress);
  expect(parseBusLocation({ status: "LIVE", position, ...progress, stopsLeft: 0, estimate: { ...progress.estimate, secondsAway: 0 } }).estimate?.secondsAway).toBe(0);
});
it("retains planned time and progress without GPS or ETA", () => {
  expect(parseBusLocation({ status: "UNAVAILABLE", position: null, ...progress, estimate: null })).toMatchObject({ stopsLeft: 2, plannedTime: "07:18", estimate: null });
  expect(parseBusLocation({ status: "STALE", position: { ...position, ageSeconds: 140 }, ...progress, estimate: null }).estimate).toBeNull();
});
it("supports afternoon null plans and a no-longer-waiting child", () => {
  expect(parseBusLocation({ status: "LIVE", position, ...progress, plannedTime: null }).plannedTime).toBeNull();
  expect(parseBusLocation({ status: "UNAVAILABLE", position: null, stopsLeft: null, plannedTime: null, estimate: null }).stopsLeft).toBeNull();
});
it.each([
  { stopsLeft: 1 }, { ...progress, plannedTime: "24:00" }, { ...progress, stopsLeft: -1 },
  { ...progress, estimate: { ...progress.estimate, secondsAway: -1 } },
  { ...progress, estimate: { ...progress.estimate, secondsAway: 1.5 } },
  { ...progress, estimate: { ...progress.estimate, arrivesAt: "2026-10-21T04:21:50+00:00" } },
  { ...progress, stopsLeft: null },
])("rejects incomplete or invalid ETA/progress %j", fields => expect(() => parseBusLocation({ status: "LIVE", position, ...fields })).toThrow());
it.each(["STALE", "UNAVAILABLE"])("rejects an estimate on %s GPS", status => {
  expect(() => parseBusLocation({ status, position: status === "STALE" ? { ...position, ageSeconds: 140 } : null, ...progress })).toThrow();
});

it("accepts authoritative STALE at a truncated age of 60 seconds", () => {
  // RunService compares the precise Duration before serializing age.toSeconds().
  expect(parseBusLocation({ status: "STALE", position: { ...position, ageSeconds: 60 } }).status).toBe("STALE");
});
it("still rejects STALE below the server's truncated freshness boundary", () => {
  expect(() => parseBusLocation({ status: "STALE", position: { ...position, ageSeconds: 59 } })).toThrow();
});
