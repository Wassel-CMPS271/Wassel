import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeJUnit } from "./scrum295-junit-summary.mjs";
test("JUnit report preserves failures while omitting logs and captured secrets", () => {
  const xml='<testsuite name="independent.fixture" tests="2" failures="1" errors="0" skipped="0"><testcase name="pass"/><testcase name="realFailure"><failure message="private"/><system-out>fixture-cookie-not-real</system-out></testcase></testsuite>';
  const result=summarizeJUnit(xml);
  assert.equal(result.passed,1); assert.equal(result.failures,1);
  assert.equal(result.cases[1].status,"failed"); assert.doesNotMatch(JSON.stringify(result),/private|cookie|system-out/);
});
test("missing or inconsistent JUnit reports cannot be presented as green", () => {
  assert.throws(()=>summarizeJUnit("not xml"),/Missing/);
  assert.throws(()=>summarizeJUnit('<testsuite tests="2" failures="0" errors="0" skipped="0"><testcase name="one"/></testsuite>'),/case count/);
});
test("status counts must match actual failed cases", () => {
  assert.throws(()=>summarizeJUnit('<testsuite tests="1" failures="0" errors="0" skipped="0"><testcase name="bad"><failure/></testcase></testsuite>'),/statuses/);
});
