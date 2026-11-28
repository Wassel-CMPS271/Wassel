/** Run the actual candidate workload; failures remain failures and only numeric evidence is published. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {compose,sql} from "./stack.mjs";
import {inspectSteadyState} from "../../scripts/scrum295-load-audit.mjs";
const mode=process.env.SCRUM295_MODE;
assert.ok(["full","burst"].includes(mode));
const run=spawnSync("docker",[...compose,"run","--rm","--no-deps","k6","run","/work/scrum295-entry.js"],{stdio:"inherit",timeout:25*60*1000});
const nativeExit=run.status ?? 1;
const evidence={mode,candidateSource:"cab56d67dabe1acf69884607c87bf936c92309e4",nativeExit,scope:mode==="full"?"Unchanged full school scenario on SCRUM-289 defaults; no quota override":"Additional 100/minute subcriterion on a fresh default-quota stack; not full 300-user acceptance"};
try {
  evidence.authEmailRows=Number(sql("SELECT count(*) FROM auth_emails"));
  const summary=JSON.parse(readFileSync("candidate-load/loadtest/results/scrum295-summary.json","utf8"));
  assert.ok(!("setup_data" in summary) && !("tokens" in summary),"No authentication material may be published");
  const collect=group=>[...(group.checks??[]).map(c=>({name:c.name,passes:c.passes,fails:c.fails})),...(group.groups??[]).flatMap(collect)];
  evidence.checks=collect(summary.root_group);
  evidence.nativeThresholds=Object.fromEntries(Object.entries(summary.metrics).filter(([,row])=>row.thresholds).map(([name,row])=>[name,row.thresholds]));
  evidence.observed=summary.independentMeasured;
  if(mode==="full") evidence.audit=inspectSteadyState(summary,"server_errors");
  else {
    const metric=(name,field)=>summary.metrics[name]?.values?.[field];
    const byName=name=>evidence.checks.find(c=>c.name===name);
    evidence.signInP95Millis=metric("sign_in_duration","p(95)");
    evidence.passwordP95Millis=metric("http_req_duration{phase:signin-password}","p(95)");
    evidence.codeP95Millis=metric("http_req_duration{phase:signin-code}","p(95)");
    evidence.serverErrors=metric("server_errors","count");
    evidence.failedSignIns=metric("sign_in_failures","count");
    evidence.subcriterionPassed=nativeExit===0 && evidence.observed?.completedIterations===100 && byName("login answered 204")?.passes===100 && byName("verify answered 200")?.passes===100 && evidence.checks.every(c=>c.fails===0) && evidence.serverErrors===0 && evidence.failedSignIns===0 && evidence.signInP95Millis<1000 && evidence.passwordP95Millis<1000 && evidence.codeP95Millis<1000 && evidence.authEmailRows===100;
  }
} catch(error) {
  evidence.incomplete=true; evidence.error=error.code==="ENOENT"?"No completed k6 summary was produced":error.message;
}
writeFileSync("tmp/posth-"+mode+"-result.json",JSON.stringify(evidence,null,2)+"\n");
console.log(JSON.stringify({mode,nativeExit,authEmailRows:evidence.authEmailRows,subcriterionPassed:evidence.subcriterionPassed,auditPassed:evidence.audit?.pass,incomplete:evidence.incomplete??false}));
process.exitCode=nativeExit!==0?nativeExit:evidence.incomplete || (mode==="full"?!evidence.audit?.pass:!evidence.subcriterionPassed)?1:0;
