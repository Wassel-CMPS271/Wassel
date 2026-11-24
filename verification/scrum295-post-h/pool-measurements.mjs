/** Parse only fixed numerical pool-measurement rows; never publish raw authentication logs. */
export function poolMeasurements(log) {
  const expression=/SCRUM-289 \| (100 logins (?:over 60 s|at once), provider takes (?:800|3000|5000) ms) \| max active (\d+) \| max waiting (\d+) \| login statuses (\{-?\d+=\d+(?:, -?\d+=\d+)*\}) \| login ms p50 (\d+) \/ p95 (\d+) \/ max (\d+) \| probe ms p50 (\d+) \/ p95 (\d+) \/ max (\d+) \(non-200: (\d+)\)/g;
  return [...log.matchAll(expression)].map(m=>({scenario:m[1],maxActive:Number(m[2]),maxWaiting:Number(m[3]),loginStatuses:Object.fromEntries([...m[4].matchAll(/(-?\d+)=(\d+)/g)].map(p=>[p[1],Number(p[2])])),loginMillis:{p50:Number(m[5]),p95:Number(m[6]),max:Number(m[7])},probeMillis:{p50:Number(m[8]),p95:Number(m[9]),max:Number(m[10])},probeNon200:Number(m[11])}));
}
export function completePoolMeasurements(rows) {
  const expected=["100 logins over 60 s, provider takes 800 ms","100 logins over 60 s, provider takes 3000 ms","100 logins over 60 s, provider takes 5000 ms","100 logins at once, provider takes 5000 ms"];
  return rows.length===4 && expected.every(name=>rows.filter(r=>r.scenario===name).length===1);
}
