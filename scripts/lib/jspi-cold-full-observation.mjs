// Preserve every old acceptance assertion except its historical zero-loss fact.
import { readFile } from "node:fs/promises";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
const source = await readFile(new URL("./jspi-three-full-observation.mjs", import.meta.url), "utf8");
export const coldFullObservationDerivation = exactPatch(source, [
  ['import { validateJspiLifecycle } from "./jspi-browser-control.mjs";',
    `import { validateJspiLifecycle } from ${JSON.stringify(new URL("./jspi-browser-control.mjs", import.meta.url).href)};\nimport { inspectColdSampleAvailability } from ${JSON.stringify(new URL("./jspi-cold-sample-availability.mjs", import.meta.url).href)};`],
  ['export function inspectThreeFullJspiRuns(terminal, report) {',
    'export function inspectThreeFullJspiRuns(terminal, report) {\n  const availability=inspectColdSampleAvailability(report);'],
  ['assert.equal(phase.unavailableSamples, 0);', 'assert.equal(phase.unavailableSamples, availability.perRun[index].unavailableSamples);'],
  ['status: "three-same-session-full-original-jspi-runs-independently-validated-below-budget", rows,',
    'status: "three-same-session-full-original-jspi-runs-independently-validated-below-budget", rows,nativeAvailability:availability,'],
]);
const factory = await import("data:text/javascript;base64," + Buffer.from(coldFullObservationDerivation.generated).toString("base64"));
export function inspectColdFullJspiRuns(...args) {
  try { return factory.inspectThreeFullJspiRuns(...args); }
  catch (error) {
    error.stack = String(error.stack).split("\n").filter(line => !line.includes("data:text/javascript")).join("\n");
    throw error;
  }
}
