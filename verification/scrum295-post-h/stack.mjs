/** Helpers for uniquely named, disposable, network-isolated candidate stacks only. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
export const project = process.env.SCRUM295_LOAD_PROJECT;
assert.match(project ?? "", /^scrum295-(?:posth-full|posth-burst|metrics-http)-\d+$/);
export const compose = ["compose", "-p", project, "-f", "candidate-load/loadtest/docker-compose.yml", "-f", "verification/scrum295/docker-isolated.yml", "-f", "verification/scrum295-post-h/candidate.yml"];
export function docker(args, options = {}) {
  return execFileSync("docker", args, {encoding:"utf8", maxBuffer:8*1024*1024, ...options});
}
export const sql = query => docker([...compose,"exec","-T","postgres","psql","-U","loadtest","-d","wassel","-At","-v","ON_ERROR_STOP=1","-c",query]).trim();
export function ownBackend() {
  const id=docker([...compose,"ps","--all","-q","backend"]).trim();
  assert.match(id,/^[a-f0-9]{12,64}$/);
  const record=JSON.parse(docker(["inspect",id]))[0];
  assert.equal(record.Config.Labels["com.docker.compose.project"],project);
  return record;
}
export const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
export function health() {
  const code='try { const r=await fetch("http://backend:8080/actuator/health",{signal:AbortSignal.timeout(1500)}); const b=await r.json(); console.log(JSON.stringify({httpStatus:r.status,status:b.status,keys:Object.keys(b).sort()})); } catch { console.log(JSON.stringify({networkFailure:true})); }';
  return JSON.parse(docker([...compose,"exec","-T","mail-stub","node","--input-type=module","-e",code]));
}
export async function ready() {
  for(let attempt=0;attempt<90;attempt++) {
    try { const result=health(); if(result.httpStatus===200 && result.status==="UP") return result; } catch {}
    await pause(2000);
  }
  throw new Error("Disposable backend did not become UP; no load result exists");
}
