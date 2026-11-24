// Exact 100-arrival subcriterion. The full 300-user runner remains unchanged and separate.
import {options as original,burst as originalBurst} from "./load.js";
import exec from "k6/execution";
import {sleep} from "k6";
import {Counter,Trend} from "k6/metrics";
const completed=new Counter("scrum295_burst_iterations");
const elapsed=new Trend("scrum295_burst_elapsed_ms");
const starts=new Trend("scrum295_burst_start_elapsed_ms");
export const options={...original,scenarios:{sign_in_burst:{executor:"shared-iterations",vus:2,iterations:100,maxDuration:"90s",exec:"burst"}},thresholds:{...original.thresholds,
  "http_req_duration{phase:signin-password}":[...original.thresholds["http_req_duration{phase:signin-password}"],"p(95)<1000"],
  sign_in_duration:[...original.thresholds.sign_in_duration,"p(95)<1000"],
  scrum295_burst_iterations:["count==100"],scrum295_burst_start_elapsed_ms:["min>=0","max<60000"]}};
export function burst(){
  // Explicit iteration budget avoids a constant-arrival-rate boundary occasionally scheduling 101 arrivals.
  const planned=exec.scenario.startTime+exec.scenario.iterationInTest*600;
  sleep(Math.max(0,(planned-Date.now())/1000));starts.add(Date.now()-exec.scenario.startTime);
  originalBurst();completed.add(1);elapsed.add(Date.now()-exec.scenario.startTime);
}
export function handleSummary(data){
  const {setup_data,...safe}=data;
  safe.independentMeasured={completedIterations:data.metrics.scrum295_burst_iterations?.values?.count,elapsedMs:data.metrics.scrum295_burst_elapsed_ms?.values?.max,lastArrivalMs:data.metrics.scrum295_burst_start_elapsed_ms?.values?.max};
  safe.scope="Targeted exactly 100 new real password/2FA sign-in arrivals within one minute on a fresh default-quota candidate; no 300-user acceptance claim.";
  return {"/work/results/scrum295-summary.json":JSON.stringify(safe,null,2)+"\n"};
}
