/** Extract native full verification counts, coverage and gated pool measurements, not HTTP/mail output. */
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {summarizeJUnit} from "../../scripts/scrum295-junit-summary.mjs";
import {jacocoPercent} from "../../scripts/scrum295-coverage-audit.mjs";
import {poolMeasurements,completePoolMeasurements} from "./pool-measurements.mjs";
const output={candidateSource:"cab56d67dabe1acf69884607c87bf936c92309e4",command:"./mvnw -B verify -Dmeasure.SCRUM-289=true",scope:"Author full backend tests rerun unchanged; gated pool measurement explicitly enabled. Author test-profile quotas differ from deployment defaults and do not prove full default-quota school acceptance."};
try {
  output.nativeExit=Number(readFileSync("tmp/posth-maven-exit.txt","utf8").trim());
  const directory="candidate-backend/backend/target/surefire-reports";
  const suites=readdirSync(directory).filter(f=>/^TEST-.*\.xml$/.test(f)).map(f=>summarizeJUnit(readFileSync(directory+"/"+f,"utf8")));
  output.totals={tests:0,passed:0,failures:0,errors:0,skipped:0};
  for(const suite of suites) for(const key of Object.keys(output.totals)) output.totals[key]+=suite[key];
  output.failedCases=suites.flatMap(s=>s.cases.filter(c=>c.status==="failed"||c.status==="error").map(c=>({suite:s.name,...c})));
  output.gatedMeasurementSuite=suites.find(s=>s.name.endsWith(".AuthEmailPoolMeasurementTests"));
  output.poolMeasurements=poolMeasurements(readFileSync("tmp/posth-maven-native.log","utf8"));
  output.measurementsComplete=completePoolMeasurements(output.poolMeasurements);
  output.backendLineCoverage=jacocoPercent(readFileSync("candidate-backend/backend/target/site/jacoco/jacoco.xml","utf8"),"LINE");
  output.passed=output.nativeExit===0 && output.totals.tests>0 && output.totals.failures===0 && output.totals.errors===0 && output.gatedMeasurementSuite?.tests===1 && output.gatedMeasurementSuite.skipped===0 && output.measurementsComplete;
} catch(error) {output.incomplete=true;output.passed=false;output.error=error.code==="ENOENT"?"Required native result file is absent":error.message;}
writeFileSync("tmp/posth-backend-results.json",JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output)); if(!output.passed) process.exitCode=1;
