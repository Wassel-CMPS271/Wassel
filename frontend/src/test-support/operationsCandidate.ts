// Test-only loader: executes the selected Git source in memory. It never copies
// or changes teammate feature files. HEAD is the CI/default integration gate;
// a reviewer can explicitly select an already-fetched feature head locally.
import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const nativeRequire = createRequire(import.meta.url);
const ref = process.env.WASSEL_OPERATIONS_CANDIDATE || "HEAD";
if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(ref)) throw new Error("Invalid candidate ref");
const cache = new Map<string, { exports: unknown }>();
export function candidate<T>(file: string, selectedRef = ref): T {
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(selectedRef)) throw new Error("Invalid candidate ref");
  const key = selectedRef + ":" + file;
  const cached = cache.get(key); if (cached) return cached.exports as T;
  let source: string;
  try { source = execFileSync("git", ["show", `${selectedRef}:frontend/src/${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { throw new Error(`SCRUM-282 dependency missing: ${file} at ${selectedRef}. Integrate SCRUM-273 or explicitly select its fetched head; do not skip this gate.`); }
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} as unknown }; cache.set(key, loaded);
  const load = (name: string): unknown => {
    if (name.startsWith(".") || name.startsWith("@/")) {
      const next = name.startsWith("@/") ? name.slice(2) : posix.normalize(posix.join(posix.dirname(file), name));
      if (next.endsWith(".ts") || next.endsWith(".tsx")) return candidate(next, selectedRef);
      let ext = ".ts";
      try { execFileSync("git", ["cat-file", "-e", `${selectedRef}:frontend/src/${next}.ts`], { stdio: "ignore" }); } catch { ext = ".tsx"; }
      return candidate(next + ext, selectedRef);
    }
    return nativeRequire(name);
  };
  new Function("module", "exports", "require", js)(loaded, loaded.exports, load);
  return loaded.exports as T;
}
