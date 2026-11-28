import assert from "node:assert/strict";
import { test } from "node:test";
import {
  jacocoPercent, vitestPercent, verifyCoverage,
} from "./scrum295-coverage-audit.mjs";

const contract = {
  backend: { metric: "LINE", baseline: 82, floor: 80 },
  frontend: { metric: "lines", baseline: 72, floor: 70 },
};

// A package counter can differ from the authoritative report-level counter.
const jacoco = (covered, missed) =>
  '<?xml version="1.0"?><report name="Wassel">' +
  '<package name="module"><counter type="LINE" missed="99" covered="1"/></package>' +
  '<counter type="INSTRUCTION" missed="10" covered="90"/>' +
  '<counter type="LINE" missed="' + missed + '" covered="' + covered + '"/>' +
  '</report>';

const vitest = (covered, total) => ({
  total: { lines: { total, covered, skipped: 0, pct: (100 * covered) / total } },
});

test("JaCoCo uses report-level coverage, not package-level coverage", () => {
  assert.equal(jacocoPercent(jacoco(81, 19), "LINE"), 81);
});

test("Vitest uses the exact counts, not rounded display only", () => {
  assert.equal(vitestPercent(vitest(711, 1000), "lines"), 71.1);
});

test("both results above the frozen floors pass", () => {
  const result = verifyCoverage(contract, jacoco(81, 19), vitest(71, 100));
  assert.equal(result.pass, true);
  assert.deepEqual(result.results.map((r) => r.pass), [true, true]);
});

test("the exact floor passes for each measurement", () => {
  assert.equal(verifyCoverage(contract, jacoco(80, 20), vitest(70, 100)).pass, true);
});

test("backend even slightly below its floor fails independently", () => {
  const result = verifyCoverage(contract, jacoco(799, 201), vitest(71, 100));
  assert.equal(result.pass, false);
  assert.deepEqual(result.results.map((r) => r.pass), [false, true]);
});

test("frontend even slightly below its floor fails independently", () => {
  const result = verifyCoverage(contract, jacoco(81, 19), vitest(699, 1000));
  assert.equal(result.pass, false);
  assert.deepEqual(result.results.map((r) => r.pass), [true, false]);
});

test("cannot lower a floor without also detecting the frozen baseline mismatch", () => {
  const altered = structuredClone(contract);
  altered.frontend.floor = 60;
  assert.throws(() => verifyCoverage(altered, jacoco(81, 19), vitest(71, 100)), /minus 2/);
});

test("missing JaCoCo metric fails closed", () => {
  assert.throws(() => jacocoPercent(jacoco(81, 19), "BRANCH"), /exactly one/);
});

test("empty JaCoCo counters fail closed", () => {
  assert.throws(() => jacocoPercent(jacoco(0, 0), "LINE"), /denominator/);
});

test("malformed Vitest report fails closed", () => {
  assert.throws(() => vitestPercent({ total: {} }, "lines"), /Missing or invalid/);
});

test("disagreeing Vitest percentage and counters fail closed", () => {
  const summary = vitest(75, 100);
  summary.total.lines.pct = 90;
  assert.throws(() => vitestPercent(summary, "lines"), /disagrees/);
});

test("missing baseline fails closed", () => {
  assert.throws(() => verifyCoverage({}, jacoco(81, 19), vitest(71, 100)), /Missing\/invalid/);
});


test("raising either coverage floor is allowed without accepting a lower floor", () => {
  const stricter = structuredClone(contract);
  stricter.backend.floor = 80.5;
  stricter.frontend.floor = 70.5;
  assert.equal(verifyCoverage(stricter, jacoco(81, 19), vitest(71, 100)).pass, true);
});

test("a rounded floor even 0.02pp below the minimum is still refused", () => {
  const lower = structuredClone(contract);
  lower.backend = { metric: "LINE", baseline: 96.72, floor: 94.7 };
  assert.throws(() => verifyCoverage(lower, jacoco(97, 3), vitest(71, 100)), /minus 2/);
});
