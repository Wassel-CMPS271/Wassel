// A separate 100/minute subcriterion, NOT a replacement for the full 300-user/ten-minute scenario.
import {options as original,burst as originalBurst} from "./load.js";
import exec from "k6/execution";
import {Counter,Trend} from "k6/metrics";
const completed=new Counter("scrum295_burst_iterations");
const elapsed=new Trend("scrum295_burst_elapsed_ms");
export const options={...original,scenarios:{sign_in_burst:{...original.scenarios.sign_in_burst,startTime:"0s"}},thresholds:{...original.thresholds,
  "http_req_duration{phase:signin-password}":[...original.thresholds["http_req_duration{phase:signin-password}"],"p(95)<1000"],
  sign_in_duration:[...original.thresholds.sign_in_duration,"p(95)<1000"],
  scrum295_burst_iterations:["count==100"]}};
export function burst(){originalBurst();completed.add(1);elapsed.add(Date.now()-exec.scenario.startTime);}
export function handleSummary(data){
  const {setup_data,...safe}=data;
  safe.independentMeasured={completedIterations:data.metrics.scrum295_burst_iterations?.values?.count,elapsedMs:data.metrics.scrum295_burst_elapsed_ms?.values?.max};
  safe.scope="Targeted 100 new real password/2FA sign-ins over one minute on a fresh default-quota candidate; no 300-user acceptance claim.";
  return {"/work/results/scrum295-summary.json":JSON.stringify(safe,null,2)+"\n"};
}
