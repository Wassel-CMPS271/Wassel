import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyNativeCoverageFailure } from "./scrum295-coverage-probe-result.mjs";
const record=()=>({exitCode:1,floor:94.7,measured:80,tests:100,failures:0,errors:0,skipped:0,log:"jacoco:0.8.13:check\nCoverage checks have not been met"});
test("only a below-floor native rejection after clean functional tests is accepted",()=>assert.equal(verifyNativeCoverageFailure("backend",record()).gateRejectedRegression,true));
for (const [name,edit] of [["passing command",r=>r.exitCode=0],["failed functional assertion",r=>r.failures=1],["runtime error",r=>r.errors=1],["no tests",r=>r.tests=0],["coverage above floor",r=>r.measured=98],["compile failure instead of gate",r=>r.log="Compilation error"]]) test("refuses "+name,()=>{const r=record();edit(r);assert.throws(()=>verifyNativeCoverageFailure("backend",r));});
test("frontend requires the real Vitest line-threshold failure",()=>{const r=record();r.log="ERROR: Coverage for lines (80%) does not meet global threshold (86.6%)";r.floor=86.6;assert.equal(verifyNativeCoverageFailure("frontend",r).gateRejectedRegression,true);});
