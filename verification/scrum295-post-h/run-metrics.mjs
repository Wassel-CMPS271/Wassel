/** Orchestrate ONLY our newly created candidate container, with the HTTP client's cookies held in its memory. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync,writeFileSync,readFileSync} from "node:fs";
import {compose,docker,ownBackend,pause} from "./stack.mjs";
const marker="candidate-load/loadtest/results/metrics-ready.json";
assert.ok(!existsSync(marker),"Preserving an existing marker");
const child=spawn("docker",[...compose,"exec","-T","mail-stub","node","/verification/verification/scrum295-post-h/metrics-api.mjs"],{stdio:"inherit"});
let childExit=null;const done=new Promise(resolve=>child.on("exit",code=>{childExit=code??1;resolve(childExit);}));
const record={candidateSource:"e8bca50722324279df6be686843949b06a212500",sourceWasNotPatched:true,externalMonitorVerified:false,events:[]};
try {
  const deadline=Date.now()+120000;
  while(!existsSync(marker)){if(childExit!==null)throw new Error("HTTP client exited before restart phase");if(Date.now()>deadline)throw new Error("No ready marker from real authenticated HTTP checks");await pause(250);}
  ownBackend();record.events.push({action:"stop own backend",at:new Date().toISOString()});docker([...compose,"stop","backend"],{stdio:"inherit"});
  await pause(3000);ownBackend();record.events.push({action:"restart own backend",at:new Date().toISOString()});docker([...compose,"start","backend"],{stdio:"inherit"});
  const finishDeadline=Date.now()+180000;
  while(childExit===null){if(Date.now()>finishDeadline)throw new Error("HTTP client did not finish after restart");await pause(250);}
  record.clientExit=childExit;process.exitCode=childExit;
} catch(error){record.error=error.message;process.exitCode=1;child.kill("SIGTERM");}
finally {
  const path="candidate-load/loadtest/results/metrics-http-result.json";
  if(existsSync(path))record.result=JSON.parse(readFileSync(path,"utf8"));
  writeFileSync("tmp/metrics-http-result.json",JSON.stringify(record,null,2)+"\n");
}
