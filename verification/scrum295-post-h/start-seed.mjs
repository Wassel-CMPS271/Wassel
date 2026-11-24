/** Start/seed a candidate without patching its backend, Dockerfile or authored load assets. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {cpus,totalmem,platform,release} from "node:os";
import {compose,project,docker,sql,ownBackend,pause,ready} from "./stack.mjs";
const mode=process.env.SCRUM295_MODE;
assert.ok(["full","burst","metrics-http"].includes(mode));
const source=execFileSync("git",["-C","candidate-backend","rev-parse","HEAD"],{encoding:"utf8"}).trim();
const expected=mode==="metrics-http"?"e8bca50722324279df6be686843949b06a212500":"cab56d67dabe1acf69884607c87bf936c92309e4";
assert.equal(source,expected);
assert.equal(resolve(process.env.SCRUM295_CANDIDATE_BACKEND),resolve("candidate-backend/backend"));
assert.equal(execFileSync("git",["-C","candidate-load","rev-parse","HEAD"],{encoding:"utf8"}).trim(),"7a938f500228f6aff0c86c1a79ed029ed0e4f65b");
mkdirSync("tmp",{recursive:true});
for(let attempt=1;attempt<=3;attempt++) {
  try { docker([...compose,"up","-d","--build","postgres","mail-stub","backend"],{stdio:"inherit"}); break; }
  catch(error) { if(attempt===3) throw error; await pause(15000); }
}
ownBackend(); await ready();
docker([...compose,"exec","-T","postgres","psql","-U","loadtest","-d","wassel","-v","ON_ERROR_STOP=1","-f","/seed/seed.sql"],{stdio:"ignore"});
assert.equal(sql("SELECT (SELECT count(*) FROM students),(SELECT count(*) FROM vehicles),(SELECT count(*) FROM users WHERE role='PARENT'),(SELECT count(*) FROM drivers),(SELECT count(*) FROM routes)"),"1000|40|800|40|40");
if(mode==="metrics-http") {
  // Extra isolated fixture only. The existing seed and candidate production files remain untouched.
  sql("INSERT INTO users (id,created_at,email,enabled,password_hash,role,school_id) SELECT gen_random_uuid(),now(),'scrum295-admin@load.test',true,password_hash,'ADMIN',school_id FROM users WHERE email='head@load.test'");
  assert.equal(sql("SELECT count(*) FROM users WHERE email='scrum295-admin@load.test' AND role='ADMIN'"),"1");
}
const services={};
for(const service of ["backend","postgres","mail-stub"]) {
  const id=docker([...compose,"ps","-q",service]).trim(); assert.match(id,/^[a-f0-9]{12,64}$/);
  const r=JSON.parse(docker(["inspect",id]))[0]; assert.equal(r.Config.Labels["com.docker.compose.project"],project);
  const env=Object.fromEntries(r.Config.Env.map(row=>{const pos=row.indexOf("=");return [row.slice(0,pos),row.slice(pos+1)];}));
  assert.equal(r.HostConfig.NanoCpus,service==="mail-stub"?250000000:1000000000);
  assert.equal(r.HostConfig.Memory,service==="mail-stub"?134217728:1073741824);
  services[service]={nanoCpus:r.HostConfig.NanoCpus,memoryBytes:r.HostConfig.Memory};
  if(service==="backend") {
    assert.equal(env.WASSEL_MAIL_BREVO_BASE_URL,"http://mail-stub:9000"); assert.equal(env.ORS_API_KEY,"");
    for(const name of ["AUTH_EMAIL_DAILY_CAP","AUTH_EMAIL_RESET_DAILY_CAP","AUTH_EMAIL_PER_ACCOUNT_DAILY_CAP"]) assert.ok(!(name in env),"Preserve default email quotas");
  }
  if(service==="mail-stub") assert.equal(env.MAIL_DELAY_MS,"800");
}
assert.equal(JSON.parse(docker(["network","inspect",project+"_default"]))[0].Internal,true);
const version=sql("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1");
assert.equal(version,mode==="metrics-http"?"17":"18");
if(mode!=="metrics-http") assert.equal(sql("SELECT count(*) FROM auth_emails"),"0");
const hash=file=>createHash("sha256").update(readFileSync(file)).digest("hex");
const record={mode,candidateSource:source,loadSource:"7a938f500228f6aff0c86c1a79ed029ed0e4f65b",flywayVersion:version,host:{platform:platform(),release:release(),cpus:cpus().length,memoryBytes:totalmem()},services,internalOnlyNetwork:true,mailDelayMillis:800,noExternalMailOrRoadTraffic:true,emailCapOverrides:false,authDailyCap:mode==="metrics-http"?null:120,dataset:{students:1000,buses:40,parents:800,drivers:40,routes:40},extraAdminFixture:mode==="metrics-http",loadScriptSha256:hash("candidate-load/loadtest/load.js"),seedSha256:hash("candidate-load/loadtest/seed.sql")};
assert.equal(record.loadScriptSha256,"79dd5d4667f2499f287906fe6cf4fc8a88c9f3e94c8f9e52711d3d608e8a709f");
writeFileSync("tmp/candidate-environment.json",JSON.stringify(record,null,2)+"\n");
console.log("Candidate started; actual migrations, dataset, resource caps, isolated network and unchanged default quotas verified.");
