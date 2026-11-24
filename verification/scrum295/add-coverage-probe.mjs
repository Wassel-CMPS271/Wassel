/** Add deliberately uncovered code ONLY to an isolated checkout; never edit existing source or tests. */
import { resolve, relative, dirname } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
const [kind, project] = process.argv.slice(2);
if (!["backend", "frontend"].includes(kind) || !project || process.argv.length !== 4) throw new Error("Expected backend/frontend and disposable project path");
const root = resolve(project);
if (relative(process.cwd(), root).startsWith("..") || root === process.cwd()) throw new Error("Probe must target a child disposable checkout");
const destination = resolve(root, kind === "backend" ? "src/main/java/independent/coverageprobe/UncoveredCoverageProbe.java" : "src/verification/uncovered-coverage-probe.ts");
if (existsSync(destination)) throw new Error("Preserving existing probe path");
const increments = Array.from({ length: 1000 }, () => "    value += 1;").join("\n");
const body = kind === "backend"
  ? "package independent.coverageprobe;\npublic final class UncoveredCoverageProbe {\n  public static int compute(int seed) {\n    int value = seed;\n" + increments + "\n    return value;\n  }\n}\n"
  : "export function independentCoverageProbe(seed: number): number {\n    let value = seed;\n" + increments + "\n    return value;\n}\n";
mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, body, { flag: "wx" });
console.log("Added an isolated uncovered regression fixture; tests and thresholds are unchanged.");
