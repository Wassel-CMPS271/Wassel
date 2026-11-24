/** Confirm a real unchanged coverage gate rejected a regression AFTER functional tests passed. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { jacocoPercent, vitestPercent } from "./scrum295-coverage-audit.mjs";
import { summarizeJUnit } from "./scrum295-junit-summary.mjs";
export function verifyNativeCoverageFailure(kind, record) {
  assert.ok(["backend","frontend"].includes(kind), "unknown coverage kind");
  assert.ok(Number.isInteger(record.exitCode) && record.exitCode !== 0, "native command must fail");
  assert.ok(Number.isFinite(record.floor) && record.floor > 0 && record.floor <= 100, "missing native floor");
  assert.ok(Number.isFinite(record.measured) && record.measured >= 0 && record.measured < record.floor, "actual measured coverage must be below the unchanged floor");
  assert.ok(Number.isInteger(record.tests) && record.tests > 0, "functional tests must actually run");
  assert.equal(record.failures,0,"a functional test failure is not a coverage-gate proof");
  assert.equal(record.errors,0,"an execution error is not a coverage-gate proof");
  const log=record.log.replace(/\x1b\[[0-9;]*m/g,"");
  if (kind === "backend") {
    assert.match(log,/jacoco[^\n]*:check/,"native JaCoCo check did not execute");
    assert.match(log,/Coverage checks have not been met|Rule violated[^\n]*lines covered ratio/,"missing native coverage rejection");
  } else assert.match(log,/Coverage for lines[^\n]*does not meet[^\n]*threshold/,"missing native Vitest line threshold rejection");
  return { kind, gateRejectedRegression:true, floor:record.floor, measured:record.measured, tests:record.tests, skipped:record.skipped ?? 0, failures:0, errors:0, nativeExit:record.exitCode };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [kind,project,logFile,exitFile,output]=process.argv.slice(2);
  if (!output || process.argv.length !== 7) throw new Error("Expected kind, disposable project, native log, exit-code file, output JSON");
  let record={ log:readFileSync(logFile,"utf8"), exitCode:Number(readFileSync(exitFile,"utf8").trim()) };
  if (kind === "backend") {
    const floors=[...readFileSync(resolve(project,"pom.xml"),"utf8").matchAll(/<minimum>([0-9.]+)<\/minimum>/g)];
    assert.equal(floors.length,1,"ambiguous backend floor");
    const reports=resolve(project,"target/surefire-reports");
    const suites=readdirSync(reports).filter(name=>/^TEST-.*\.xml$/.test(name)).map(name=>summarizeJUnit(readFileSync(resolve(reports,name),"utf8")));
    record={...record,floor:Number(floors[0][1])*100,measured:jacocoPercent(readFileSync(resolve(project,"target/site/jacoco/jacoco.xml"),"utf8"),"LINE"),tests:0,failures:0,errors:0,skipped:0};
    for (const suite of suites) for (const key of ["tests","failures","errors","skipped"]) record[key]+=suite[key];
  } else {
    const floor=/thresholds:\s*\{\s*lines:\s*([0-9.]+)/.exec(readFileSync(resolve(project,"vitest.config.mts"),"utf8"));
    assert.ok(floor,"missing configured frontend floor");
    const report=JSON.parse(readFileSync(resolve(project,"scrum295-functional-results.json"),"utf8"));
    record={...record,floor:Number(floor[1]),measured:vitestPercent(JSON.parse(readFileSync(resolve(project,"coverage/coverage-summary.json"),"utf8")),"lines"),tests:report.numTotalTests,failures:report.numFailedTests,errors:report.numRuntimeErrorTestSuites ?? 0,skipped:report.numPendingTests};
  }
  const result=verifyNativeCoverageFailure(kind,record);
  result.sourceSha="7a938f500228f6aff0c86c1a79ed029ed0e4f65b";
  mkdirSync(dirname(output),{recursive:true}); writeFileSync(output,JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result));
}
