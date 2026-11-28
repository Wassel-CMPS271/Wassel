/** Capture only non-secret limits and dataset provenance from our own disposable project. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cpus, totalmem, platform, release } from "node:os";
import { createHash } from "node:crypto";
const [project,output]=process.argv.slice(2);
assert.match(project ?? "",/^scrum295-load-\d+$/);
const compose=["compose","-p",project,"-f","candidate-load/loadtest/docker-compose.yml","-f","verification/scrum295/docker-isolated.yml"];
const services={};
for (const service of ["backend","postgres","mail-stub"]) {
  const id=execFileSync("docker",[...compose,"ps","-q",service],{encoding:"utf8"}).trim();
  assert.match(id,/^[a-f0-9]{12,64}$/);
  const data=JSON.parse(execFileSync("docker",["inspect",id],{encoding:"utf8"}))[0];
  assert.equal(data.Config.Labels["com.docker.compose.project"],project);
  services[service]={nanoCpus:data.HostConfig.NanoCpus,memoryBytes:data.HostConfig.Memory};
  assert.equal(data.HostConfig.NanoCpus, service === "mail-stub" ? 250_000_000 : 1_000_000_000, "required CPU cap differs");
  assert.equal(data.HostConfig.Memory, service === "mail-stub" ? 128 * 1024 * 1024 : 1024 * 1024 * 1024, "required memory cap differs");
  if(service==="backend") {
    const env=Object.fromEntries(data.Config.Env.map(value=>{const pos=value.indexOf("=");return [value.slice(0,pos),value.slice(pos+1)];}));
    assert.equal(env.WASSEL_MAIL_BREVO_BASE_URL,"http://mail-stub:9000");assert.equal(env.ORS_API_KEY,"");
  }
}
const network=JSON.parse(execFileSync("docker",["network","inspect",project+"_default"],{encoding:"utf8"}))[0];
assert.equal(network.Internal,true);
const hash=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const result={sourceSha:"e9de4167a5d669289461b5054b5f0a28f8238358",host:{platform:platform(),release:release(),cpus:cpus().length,memoryBytes:totalmem()},services,internalOnlyNetwork:true,mailStandIn:true,roadApiKeyAbsent:true,dataset:{students:1000,buses:40,parents:800,drivers:40,routes:40},datasetWasCheckedInSQL:true,loadScriptSha256:hash("candidate-load/loadtest/load.js"),seedSha256:hash("candidate-load/loadtest/seed.sql")};
mkdirSync("tmp",{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log("Captured disposable-stack limits, fake-mail/no-road-key configuration and source hashes; no credentials recorded.");
