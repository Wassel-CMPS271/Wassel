/** Real HTTP roles/2FA/counter checks, then an observed process restart. Cookies remain in memory only. */
import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {verifyMetricsSnapshot} from "../../scripts/scrum295-metrics-contract.mjs";
const BASE="http://backend:8080";
const result={candidateSource:"e9de4167a5d669289461b5054b5f0a28f8238358",scope:"Real HTTP with password and fake-provider-delivered 2FA, private backend outage/recovery and metrics restart; no external monitor or frontend alert claim.",checks:[],externalMonitorVerified:false,frontendMonitorVerified:false};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const record=async(name,work)=>{try{const evidence=await work();result.checks.push({name,pass:true,...evidence});}catch(error){result.checks.push({name,pass:false,reason:error.message});}};
function save(){writeFileSync("/results/metrics-http-result.json",JSON.stringify(result,null,2)+"\n");}
function cookie(jar){return [...jar.entries()].map(([name,value])=>name+"="+value).join("; ");}
async function request(path,jar,body){
  const headers={}; if(jar?.size) headers.Cookie=cookie(jar); if(body) headers["Content-Type"]="application/json";
  return fetch(BASE+path,{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined,redirect:"manual",signal:AbortSignal.timeout(10000)});
}
function receivedCookies(response,jar){for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0];const at=pair.indexOf('=');const name=pair.slice(0,at);if(!["wassel_2fa","wassel_token"].includes(name))continue;const token=pair.slice(at+1);if(token)jar.set(name,token);else jar.delete(name);}}
async function signIn(email){
  const jar=new Map();const login=await request("/api/auth/login",null,{email,password:"LoadTest-Pass-1"});
  assert.equal(login.status,204,"Password step status"); receivedCookies(login,jar);
  if(!jar.has("wassel_2fa")) throw new Error("Pending cookie was not issued");
  const mail=await fetch("http://mail-stub:9000/code?email="+encodeURIComponent(email),{signal:AbortSignal.timeout(10000)});
  if(mail.status!==200) throw new Error("Isolated mail provider has no verification code");
  const body=await mail.json();if(typeof body.code!=="string"||!/^\d{6}$/.test(body.code))throw new Error("Missing isolated test-mail verification code");
  const verified=await request("/api/auth/2fa/verify",jar,{code:body.code});assert.equal(verified.status,200,"Real verification step status");receivedCookies(verified,jar);
  if(!jar.has("wassel_token"))throw new Error("Session cookie was not issued");
  return jar;
}
async function metrics(jar){const response=await request("/api/admin/metrics",jar);assert.equal(response.status,200,"Admin metrics status");return verifyMetricsSnapshot(await response.json());}
async function health(){
  try{const response=await fetch(BASE+"/actuator/health",{signal:AbortSignal.timeout(800)});const body=await response.json();return {at:new Date().toISOString(),httpStatus:response.status,status:body.status,keys:Object.keys(body).sort()};}
  catch{return {at:new Date().toISOString(),networkFailure:true};}
}
try {
  await record("Public health is minimal",async()=>{const value=await health();assert.equal(value.httpStatus,200);assert.equal(value.status,"UP");assert.deepEqual(value.keys,["status"]);return {observation:value};});
  await record("No session is refused without metric fields",async()=>{const response=await request("/api/admin/metrics");assert.equal(response.status,401);assert.ok(!(await response.text()).includes("serverErrors"));return {status:response.status};});
  const users={};for(const [role,email] of Object.entries({admin:"scrum295-admin@load.test",head:"head@load.test",driver:"driver1@load.test",parent:"parent1@load.test"}))users[role]=await signIn(email);
  await record("Real admin session receives canonical aggregate metrics",async()=>{const value=await metrics(users.admin);return {status:200,resetsOnRestart:value.resetsOnRestart};});
  for(const role of ["head","driver","parent"])await record("Real "+role+" session is refused without metric fields",async()=>{const response=await request("/api/admin/metrics",users[role]);assert.equal(response.status,403);assert.ok(!(await response.text()).includes("serverErrors"));return {status:response.status};});
  await record("Actuator prefix lookalike 404 increments request count",async()=>{
    const before=await metrics(users.admin);const response=await request("/actuator-not-an-endpoint",users.admin);assert.equal(response.status,404);
    const after=await metrics(users.admin);const actualDelta=after.requests.total-before.requests.total;
    result.prefixObservation={responseStatus:response.status,expectedDelta:1,actualDelta};
    assert.equal(actualDelta,1,"Ordinary 404 must be counted");return result.prefixObservation;
  });
  await record("Two real invalid-password answers increment exact counters",async()=>{
    const before=await metrics(users.admin);for(let n=0;n<2;n++)assert.equal((await request("/api/auth/login",null,{email:"scrum295-does-not-exist@load.test",password:"Wrong-Test-Pass-1"})).status,401);
    const after=await metrics(users.admin);assert.equal(after.requests.total-before.requests.total,2);assert.equal(after.signIns.failed-before.signIns.failed,2);
    return {requestDelta:2,failedSignInDelta:2};
  });
  result.beforeRestart=await metrics(users.admin);assert.ok(result.beforeRestart.requests.total>0);
  writeFileSync("/results/metrics-ready.json",JSON.stringify({ready:true,at:new Date().toISOString()})+"\n",{flag:"wx"});
  let down=null,up=null;const deadline=Date.now()+180000;
  while(Date.now()<deadline){const value=await health();if(!down&&value.networkFailure)down=value;else if(down&&value.httpStatus===200&&value.status==="UP"){up=value;break;}await pause(250);}
  await record("Private backend outage and recovery are actually observed",async()=>{assert.ok(down,"No down transition observed");assert.ok(up,"No recovery observed");return {down,up,observedDownToUpMillis:Date.parse(up.at)-Date.parse(down.at),externalAlertObserved:false};});
  await record("Actual backend restart resets counters and preserves valid session",async()=>{
    assert.ok(up,"Recovery required before reading metrics");const after=await metrics(users.admin);assert.notEqual(after.since,result.beforeRestart.since);
    for(const value of [after.requests.total,after.requests.serverErrors,after.requests.tooManyRequests,after.signIns.failed,after.signIns.lockouts,after.notifications.sent,after.notifications.failed])assert.equal(value,0);
    assert.equal(after.requests.p95Millis,null);assert.equal(after.requests.errorRate,null);assert.equal(after.notifications.successRate,null);result.afterRestart=after;
    return {newSince:after.since,zeroCounters:true,sameAuthenticatedCookieAccepted:true};
  });
} catch(error){result.fatal={reason:error.message};}
result.passed=result.checks.length===10&&!result.fatal&&result.checks.every(c=>c.pass);
save();console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.pass).length,failed:result.checks.filter(c=>!c.pass).length,fatal:!!result.fatal}));
if(!result.passed)process.exitCode=1;
