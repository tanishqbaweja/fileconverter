// Compact read-only inspection of the terminal three-run result.
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { inspectThreeFullJspiRuns } from "./lib/jspi-three-full-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path), { maxOutputLength: 33554432 }));
if (process.argv[2] === "--warmup") {
  const smallTerminal = JSON.parse(await readFile("evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"));
  const small = JSON.parse(gunzipSync(await readFile(smallTerminal.report.path), { maxOutputLength: 33554432 }));
  console.log(JSON.stringify({ smallJobs: small.progressProbe.successfulSaveControl.jspiLifecycle.samples.length,
    smallLoaded: small.loadedIdle.privateBytes, smallAfterAllJobs: small.progressProbe.afterSuccessfulSaveIdle.privateBytes,
    smallRetainedAboveLoadedMiB: (small.progressProbe.afterSuccessfulSaveIdle.privateBytes - small.loadedIdle.privateBytes) / 1048576,
    fullLoaded: report.loadedIdle.privateBytes, fullRecoveries: report.runs.map(run => run.recovery.privateBytes),
    inferenceOnlyNotAllocationCauseOrLeakProof: true }, null, 2));
  process.exit(0);
}
console.log(JSON.stringify({ ...inspectThreeFullJspiRuns(terminal, report),
  report: terminal.report, loaded: report.loadedIdle, sourceCount: Object.keys(report.sourceHashes).length }, null, 2));
