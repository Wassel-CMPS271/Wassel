// Reporting/observation only: the author's business callbacks are invoked unchanged.
// Keep every original threshold; add stricter independent duration/actor measurements.
import { options as originalOptions, setup, parent as originalParent, driver as originalDriver, burst as originalBurst } from "./load.js";
import exec from "k6/execution";
import { Counter, Trend } from "k6/metrics";
const elapsed = new Trend("scrum295_steady_elapsed_ms");
const parents = new Counter("scrum295_parent_actors");
const drivers = new Counter("scrum295_driver_actors");
const completedBurst = new Counter("scrum295_burst_completed");
let observedActor = false; // k6 module state is private to each VU.
export const options = { ...originalOptions, thresholds: {
  ...originalOptions.thresholds,
  "http_reqs{phase:steady}": ["count>=0"],
  scrum295_steady_elapsed_ms: ["max>=600000"],
  scrum295_parent_actors: ["count==260"],
  scrum295_driver_actors: ["count==40"],
  scrum295_burst_completed: ["count>=100"]
} };
export { setup };
export function parent(data) {
  if (!observedActor) { parents.add(1); observedActor = true; }
  originalParent(data); elapsed.add(Date.now() - exec.scenario.startTime);
}
export function driver(data) {
  if (!observedActor) { drivers.add(1); observedActor = true; }
  originalDriver(data); elapsed.add(Date.now() - exec.scenario.startTime);
}
export function burst(data) { originalBurst(data); completedBurst.add(1); }
export function handleSummary(data) {
  const { setup_data, ...safe } = data; // Never publish the disposable session tokens.
  safe.independentMeasured = {
    steadyBackendRequests: data.metrics["http_reqs{phase:steady}"]?.values?.count,
    steadyElapsedMs: data.metrics.scrum295_steady_elapsed_ms?.values?.max,
    parentActors: data.metrics.scrum295_parent_actors?.values?.count,
    driverActors: data.metrics.scrum295_driver_actors?.values?.count,
    completedBurst: data.metrics.scrum295_burst_completed?.values?.count
  };
  safe.independentConfiguredWorkload = { parents: 260, drivers: 40, duration: "10m", burstPerMinute: 100, mailDelayMillis: 800 };
  return { "/work/results/scrum295-summary.json": JSON.stringify(safe, null, 2) + "\n" };
}
