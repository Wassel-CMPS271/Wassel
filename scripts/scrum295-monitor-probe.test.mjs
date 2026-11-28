import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validatedOrigin, checkTarget, checkExpectation,
} from "./scrum295-monitor-probe.mjs";

const reply = (status, json = { status: "UP" }) => ({
  status, json: async () => json,
});

test("allows local isolated HTTP backend", () => {
  assert.equal(validatedOrigin("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
});

test("blocks known live Railway backend even with remote override", () => {
  assert.throws(
    () => validatedOrigin("https://wassel-production.up.railway.app", true),
    /Refusing known live backend/
  );
});

test("blocks external host without explicit disposable-test opt-in", () => {
  assert.throws(() => validatedOrigin("https://test.example.org"), /require HTTPS/);
});

test("remote opt-in requires TLS", () => {
  assert.throws(() => validatedOrigin("http://test.example.org", true), /require HTTPS/);
});

test("explicit remote HTTPS test host allowed with opt-in", () => {
  assert.equal(validatedOrigin("https://test.example.org", true), "https://test.example.org");
});

test("rejects path and embedded credentials", () => {
  assert.throws(() => validatedOrigin("http://localhost:8080/app"), /origin/);
  assert.throws(() => validatedOrigin("http://a:secret@localhost:8080"), /origin/);
});

test("backend minimal public UP health passes", async () => {
  const got = await checkTarget("http://localhost:8080", "backend", async (url, opt) => {
    assert.equal(url, "http://localhost:8080/actuator/health");
    assert.equal(opt.method, "GET");
    return reply(200);
  });
  assert.equal(got.up, true);
});

test("backend with internal component details is unacceptable", async () => {
  const got = await checkTarget("http://localhost:8080", "backend", async () =>
    reply(200, { status: "UP", components: { db: "UP" } })
  );
  assert.equal(got.up, false);
});

test("backend down response is recorded as down", async () => {
  const got = await checkTarget("http://localhost:8080", "backend", async () =>
    reply(503, { status: "DOWN" })
  );
  assert.equal(got.up, false);
  assert.equal(got.status, 503);
});

test("backend network failure is down without throwing", async () => {
  const got = await checkTarget("http://localhost:8080", "backend", async () => {
    throw Error("connection refused");
  });
  assert.equal(got.up, false);
  assert.equal(got.reason, "request-or-response-error");
});

test("frontend healthy html response passes", async () => {
  const got = await checkTarget("http://localhost:3000", "frontend", async () => reply(200));
  assert.equal(got.up, true);
});

test("frontend 500 response is down", async () => {
  const got = await checkTarget("http://localhost:3000", "frontend", async () => reply(500));
  assert.equal(got.up, false);
});

test("expected outage succeeds only when both probes are down", () => {
  const both = [{ kind: "backend", up: false }, { kind: "frontend", up: false }];
  assert.equal(checkExpectation(both, { backend: "down", frontend: "down" })
    .every((x) => x.pass), true);
  assert.equal(checkExpectation(both, { backend: "up", frontend: "down" })
    .every((x) => x.pass), false);
});

test("invalid/missing expectations fail closed", () => {
  assert.throws(
    () => checkExpectation([{ kind: "backend", up: true }, { kind: "frontend", up: true }],
      { backend: "up" }), /Missing explicit/
  );
});
