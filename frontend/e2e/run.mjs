import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { createServer } from "node:net";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(frontend, "../backend");
const artifacts = resolve(frontend, "e2e-artifacts");
mkdirSync(artifacts, { recursive: true });
const windows = process.platform === "win32";
const children = [];
const env = {
  ...process.env,
  WASSEL_E2E: "true",
  WASSEL_E2E_PASSWORD: randomBytes(24).toString("base64url"),
  JWT_SECRET: randomBytes(48).toString("base64url"),
  DB_URL: process.env.E2E_DB_URL || "jdbc:h2:mem:wassel_e2e;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
  DB_USERNAME: process.env.E2E_DB_USERNAME || "sa",
  DB_PASSWORD: process.env.E2E_DB_PASSWORD || "",
  ADMIN_EMAIL: "", ADMIN_PASSWORD: "", DEMO_DATA_ENABLED: "false",
  ORS_API_KEY: "", JWT_COOKIE_SECURE: "false",
  SCHOOL_LATITUDE: "33.896", SCHOOL_LONGITUDE: "35.484",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
  FRONTEND_BASE_URL: "http://127.0.0.1:4173",
  NEXT_PUBLIC_API_BASE_URL: "", BACKEND_URL: "http://127.0.0.1:18080",
  MAIL_USERNAME: "", MAIL_PASSWORD: "",
};
const postgres = env.DB_URL.startsWith("jdbc:postgresql:");
env.E2E_DDL_AUTO = postgres ? "validate" : "create-drop";
env.E2E_FLYWAY_ENABLED = String(postgres);

function launch(command, args, cwd, logfile) {
  // Only .cmd launchers require the Windows shell. Paths are quoted; no command
  // is built from credentials, datasource values, or browser input.
  const cmdScript = windows && command.endsWith(".cmd");
  if (cmdScript && [command, ...args].some(value => /["%\r\n&|<>^!]/.test(value))) {
    throw new Error("Maven command/path contains unsupported Windows shell metacharacters");
  }
  const executable = cmdScript ? (process.env.ComSpec || "cmd.exe") : command;
  const spawnArgs = cmdScript ? ["/d", "/s", "/c", `"${[command, ...args].map(value => `"${value}"`).join(" ")}"`] : args;
  // Clear stale readiness markers synchronously before the child can be polled.
  if (logfile) writeFileSync(resolve(artifacts, logfile), "");
  const child = spawn(executable, spawnArgs, {
    cwd, env, shell: false, windowsVerbatimArguments: cmdScript, windowsHide: true,
    stdio: logfile ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  children.push(child);
  if (logfile) {
    const output = createWriteStream(resolve(artifacts, logfile));
    child.stdout.pipe(output); child.stderr.pipe(output);
    child.on("close", () => output.end());
  }
  return child;
}
async function run(command, args, cwd, logfile) {
  const child = launch(command, args, cwd, logfile);
  await new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("exit", code => code === 0 ? ok() : fail(new Error(`${command} exited ${code}; see ${logfile || "console"}`)));
  });
}
async function unusedPort(port) {
  await new Promise((ok, fail) => {
    const server = createServer(); server.once("error", () => fail(new Error(`E2E port ${port} is occupied; refusing to reuse a possibly unrelated stack`)));
    server.listen(port, "127.0.0.1", () => server.close(ok));
  });
}
async function ready(label, check, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited before readiness; see e2e-artifacts logs`);
    if (await check()) return;
    await pause(250); // Bounded readiness polling, not a browser timing assumption.
  }
  throw new Error(`${label} readiness timed out; see e2e-artifacts logs`);
}
async function stop() {
  for (const child of children.toReversed()) {
    if (child.exitCode !== null || !child.pid) continue;
    if (windows) {
      await new Promise(ok => spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("exit", ok));
    } else {
      child.kill("SIGTERM");
      await Promise.race([new Promise(ok => child.once("exit", ok)), pause(5_000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
}
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (stopping) return; stopping = true; await stop(); process.exit(130);
});
try {
  await unusedPort(4173); await unusedPort(18080);
  const maven = process.env.E2E_MAVEN_CMD || (windows ? resolve(backend, "mvnw.cmd") : resolve(backend, "mvnw"));
  const mavenArgs = ["-B", "-ntp", "test-compile", "dependency:build-classpath", "-DincludeScope=test", "-Dmdep.outputFile=target/e2e-classpath.txt"];
  if (process.env.E2E_MAVEN_REPO) mavenArgs.push(`-Dmaven.repo.local=${process.env.E2E_MAVEN_REPO}`);
  await run(maven, mavenArgs, backend, "prepare.log");
  const classpath = [resolve(backend, "target/test-classes"), resolve(backend, "target/classes"), readFileSync(resolve(backend, "target/e2e-classpath.txt"), "utf8").trim()].join(delimiter);
  const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin", windows ? "java.exe" : "java") : "java";
  const api = launch(java, ["-cp", classpath, "com.wassel.backend.e2e.RoutingE2eApplication", "--spring.profiles.active=local,e2e", "--server.address=127.0.0.1", "--server.port=18080"], backend, "backend.log");
  await ready("backend seed", async () => existsSync(resolve(artifacts, "backend.log")) && readFileSync(resolve(artifacts, "backend.log"), "utf8").includes("E2E_SEED_READY"), api);
  console.log(`E2E backend seeded (${postgres ? "PostgreSQL + Flyway" : "isolated H2 PostgreSQL mode"})`);
  const stamp = resolve(frontend, ".next/e2e-build.json");
  const buildConfig = { api: env.NEXT_PUBLIC_API_BASE_URL, backend: env.BACKEND_URL };
  if (process.env.E2E_REUSE_BUILD === "1") {
    if (!existsSync(stamp) || !existsSync(resolve(frontend, ".next/BUILD_ID"))
        || readFileSync(stamp, "utf8") !== JSON.stringify(buildConfig)) {
      throw new Error("No matching E2E production build; rerun without E2E_REUSE_BUILD");
    }
  } else {
    await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], frontend, "build.log");
    writeFileSync(stamp, JSON.stringify(buildConfig));
  }
  const web = launch(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4173"], frontend, "frontend.log");
  await ready("frontend", async () => { try { return (await fetch("http://127.0.0.1:4173/login")).ok; } catch { return false; } }, web);
  // The browser test reads only the generated disposable account password;
  // delete-on-run artifacts are ignored by git and never uploaded by CI.
  const credentials = resolve(artifacts, "credentials.json");
  writeFileSync(credentials, JSON.stringify({ email: "routing-head@e2e.invalid", password: env.WASSEL_E2E_PASSWORD }), { mode: 0o600 });
  await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], frontend);
} catch (error) {
  console.error(`E2E FAILED: ${error.message}`); process.exitCode = 1;
} finally {
  await stop();
  const { rmSync } = await import("node:fs");
  rmSync(resolve(artifacts, "credentials.json"), { force: true });
}
