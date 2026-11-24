// The failure evidence of the transport E2E (SCRUM-284): an allowlist, never a copy of what Playwright knows.
// A failed assertion's message and the response bodies hold names, emails and codes, so none of them is read here.
// Numbers, true/false, a fixed list of status words, ids replaced by {id} and server logger names get through as data.
// Three fields are the test author's own words and are copied as written: a test's title, its failing step and its
// file's base name. They may name the public seed's first names ("Karim", "Lea"), never an address or a code, and
// publish() withholds everything if one of them matches the leak patterns below.
const WORDS = ["PICKED_UP", "NOT_PRESENT", "DROPPED_OFF", "LIVE", "STALE", "UNAVAILABLE", "IN_PROGRESS", "FINISHED", "NOT_STARTED"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The annotation the helpers leave on a test after every API call, and the one place that knows its format. */
export const LAST_API_CALL = "last-api-call";
export const formatApiCall = (method: string, path: string, status: number) => `${method.toUpperCase()} ${path} ${status}`;
const API_CALL = /^([A-Z]+) (\S+) (\d{3})$/;

export function normalizePath(path: string): string { return path.split("?")[0].replace(UUID, "{id}"); }
export function safeValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value === "string" && WORDS.includes(value) ? value : "[omitted]";
}

export type TestStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
export interface MatcherResult { name?: string; expected?: unknown; actual?: unknown }
export interface RawTest {
  title: string; file: string; status: TestStatus; duration: number;
  annotations: readonly { type: string; description?: string }[]; steps: string[];
  error?: { location?: { line: number }; matcherResult?: MatcherResult };
}
export interface Summary {
  suite: "transport"; status: "passed" | "failed"; durationSeconds: number;
  tests: { title: string; file: string; status: TestStatus; durationSeconds: number; failure?: Failure }[];
  serverErrors: { logger: string; level: string; count: number }[];
}
/** What is written and published: a Summary the leak check passed. */
export type CheckedSummary = Summary & { leakCheck: "passed" };
interface Failure {
  line: number | null; step: string | null;
  lastApiCall?: { method: string; path: string; status: number };
  assertion?: { matcher: string; expected: string; received: string };
}

/** What the reporter reads from Playwright, as far as the summary needs it (Playwright's own types fit). */
export interface ReportedTest { title: string; location: { file: string }; annotations: readonly { type: string; description?: string }[] }
export interface ReportedResult {
  status: TestStatus; duration: number;
  steps: readonly { category: string; title: string; error?: unknown }[];
  error?: { location?: { line: number } };
}
/** Only the titles of top-level `test.step`s that failed; nested and non-step entries (hooks, fixtures, API calls) are not read. */
export function toRawTest(test: ReportedTest, result: ReportedResult): RawTest {
  const matcherResult = (result.error as { matcherResult?: MatcherResult } | undefined)?.matcherResult;
  return {
    title: test.title, file: test.location.file, status: result.status, duration: result.duration, annotations: test.annotations,
    steps: result.steps.filter(s => s.category === "test.step" && s.error).map(s => s.title),
    error: result.error && { location: result.error.location && { line: result.error.location.line }, matcherResult },
  };
}

function failure(test: RawTest): Failure {
  const call = test.annotations.findLast(a => a.type === LAST_API_CALL)?.description?.match(API_CALL);
  const matcher = test.error?.matcherResult;
  return {
    line: test.error?.location?.line ?? null,
    step: test.steps.at(-1) ?? null,
    ...(call && { lastApiCall: { method: call[1], path: normalizePath(call[2]), status: Number(call[3]) } }),
    ...(matcher && { assertion: { matcher: /^\w+$/.test(matcher.name ?? "") ? matcher.name! : "[omitted]", expected: safeValue(matcher.expected), received: safeValue(matcher.actual) } }),
  };
}

export function buildSummary(run: { durationMs: number; tests: RawTest[]; serverErrors: { logger: string; level: string }[] }): Summary {
  const counts = new Map<string, { logger: string; level: string; count: number }>();
  for (const { logger, level } of run.serverErrors) {
    const key = `${logger}|${level}`;
    const seen = counts.get(key);
    if (seen) seen.count++; else counts.set(key, { logger, level, count: 1 });
  }
  const tests = run.tests.map(t => ({
    title: t.title, file: t.file.split("/").at(-1)!, status: t.status, durationSeconds: Math.round(t.duration / 1000),
    ...(t.status === "passed" ? {} : { failure: failure(t) }),
  }));
  // A run with no tests, or one that made the server log an ERROR, did not pass, whatever each test said.
  const passed = tests.length > 0 && tests.every(t => t.status === "passed") && counts.size === 0;
  return { suite: "transport", status: passed ? "passed" : "failed", durationSeconds: Math.round(run.durationMs / 1000), tests, serverErrors: [...counts.values()] };
}

/** The ERROR events of the backend log, and how many events had a readable level (0 means the log's shape changed). */
export function serverErrorsOf(events: { message?: string; log?: { level?: string; logger?: string } }[]) {
  const leveled = events.filter(e => typeof e.log?.level === "string");
  return {
    leveled: leveled.length,
    errors: leveled.filter(e => e.log!.level === "ERROR").map(e => ({ logger: String(e.log!.logger), level: "ERROR" })),
  };
}

export function toMarkdown(s: Summary): string {
  const rows = s.tests.map(t => `| ${t.status} | ${t.title} | ${t.file} | ${t.durationSeconds}s |`);
  const lines = [`### Transport E2E: ${s.status} (${s.durationSeconds}s)`, "", "| Result | Test | File | Time |", "|---|---|---|---|", ...rows];
  for (const t of s.tests) if (t.failure) {
    const f = t.failure;
    const call = f.lastApiCall ? `; last call ${f.lastApiCall.method} ${f.lastApiCall.path} answered ${f.lastApiCall.status}` : "";
    const a = f.assertion ? `; ${f.assertion.matcher} expected ${f.assertion.expected}, received ${f.assertion.received}` : "";
    lines.push("", `- **${t.title}**: line ${f.line ?? "?"}, step "${f.step ?? "?"}"${call}${a}`);
  }
  for (const e of s.serverErrors) lines.push("", `- server ${e.level} x${e.count} in ${e.logger}`);
  return lines.join("\n");
}

const LEAKS: [string, RegExp][] = [
  ["email address", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i], ["token=", /token=/i], ["jwt", /eyJ[\w-]{10,}/],
  ["session cookie", /wassel_(token|2fa)/], ["verification mail", /Your (Wassel )?verification code/i],
];
/** What in `text` must never leave the runner. `password` is the run's disposable one, known only while it runs. */
export function leakFindings(text: string, password?: string): string[] {
  const found = LEAKS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (password && text.includes(password)) found.push("run password");
  return found;
}

/** The summary and its Markdown, or the leak findings that withhold both. The check covers the JSON and the Markdown. */
export function publish(summary: Summary, password: string): { summary: CheckedSummary; markdown: string } | { withheld: string[] } {
  const markdown = toMarkdown(summary);
  const withheld = leakFindings(JSON.stringify(summary) + markdown, password);
  return withheld.length ? { withheld } : { summary: { ...summary, leakCheck: "passed" }, markdown };
}
