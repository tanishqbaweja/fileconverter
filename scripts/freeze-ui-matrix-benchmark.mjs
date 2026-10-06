import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recoverStaticFormatMatrixBaseline } from "./lib/static-format-matrix-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const files = ["2026-10-06T21-29-47-865Z-ui-matrix-benchmark.json", "2026-10-06T21-31-39-423Z-ui-matrix-benchmark.json"];
const names = ["ScriptDuration", "TaskDuration", "LayoutDuration", "RecalcStyleDuration"];
const runs = [];
for (const [index, file] of files.entries()) {
  const relative = `output/playwright/${file}`, raw = await readFile(path.join(root, relative)), report = JSON.parse(raw);
  assert.equal(report.status, "completed-diagnostic"); assert.equal(report.conversionsPerformed, 0);
  assert.equal(report.benchmarkVariant, index ? "static-matrix-candidate" : "baseline");
  assert.equal(report.browserVersion, "154.0.8037.98"); assert.equal(report.alternateProfileId, "gzip-compress");
  assert.equal(report.publicAcceptance, false); assert.equal(report.completeChromiumMemoryAcceptance, false);
  assert.equal(report.conversionSpeedAcceptance, false); assert.deepEqual(report.profiles, []);
  assert.deepEqual(report.forbidden, []); assert.deepEqual(report.cleanupErrors, []); assert.equal(report.failure, null);
  for (const value of Object.values(report.cleanup)) assert.equal(value, true);
  await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
  for (const [source, digest] of Object.entries(report.sourcePins)) {
    const bytes = await readFile(path.join(root, source));
    const historical = !index && source === "app/converter/ConverterApp.tsx" ? recoverStaticFormatMatrixBaseline(bytes.toString()) : bytes;
    assert.equal(sha(historical), digest, source);
  }
  assert.ok(report.rows.filter(row => row.jobState !== null).every(row => row.jobState === "idle"));
  const phases = ["native-sampling-start", "ui-selections-20", "ui-selections-40", "ui-selections-60"];
  const rows = phases.map(phase => {
    const row = report.rows.find(value => value.phase === phase); assert.ok(row);
    return { phase, dom: row.dom, cpuSeconds: Object.fromEntries(names.map(name => {
      const value = row.performance.find(metric => metric.name === name)?.value;
      assert.ok(Number.isFinite(value) && value >= 0); return [name, value];
    })) };
  });
  const batchScriptMs = rows.slice(1).map((row, i) => (row.cpuSeconds.ScriptDuration - rows[i].cpuSeconds.ScriptDuration) * 1000);
  runs.push({ variant: report.benchmarkVariant, recordedAt: report.recordedAt, browserVersion: report.browserVersion,
    sourcePins: report.sourcePins, source: { bytes: report.originalSourceBytes, sha256: report.originalSourceSha256 },
    rawReport: { path: relative, bytes: raw.length, sha256: sha(raw) },
    matrixMarkupSha256: report.matrixMarkupSha256, alternateProfileId: report.alternateProfileId,
    rows, batchScriptMs, totalScriptMs: batchScriptMs.reduce((a, b) => a + b, 0),
    cleanup: report.cleanup, ownedPids: report.ownedPids, runtimeDirectory: report.runtimeDirectory });
}
assert.equal(runs[0].matrixMarkupSha256, runs[1].matrixMarkupSha256);
assert.deepEqual(runs[0].rows.map(row => row.dom), runs[1].rows.map(row => row.dom));
const proof = { recordedAt: new Date().toISOString(), status: "passed-ui-cpu-benchmark-only", scope: "One baseline and one candidate Chrome instance, each with three20-selection batches; production source inspection, no Convert/progress simulation. Not three clean-session conversion acceptance.",
  matrixCards: 405, selectionChangesPerRun: 60, nativeAllocationSamplingEnabled: false,
  inheritedLabelCaveat: "The raw derivative retains native-sampling phase/cleanup labels and nativeSamplingPerturbsMemory:true from its ancestor. Its exact pinned recipe replaces every Memory sampler command with Performance.enable(threadTicks)/getMetrics/disable; native allocation sampling did not run.",
  baseline: runs[0], candidate: runs[1], scriptCpuReductionPercent: (1 - runs[1].totalScriptMs / runs[0].totalScriptMs) * 100,
  exactMarkupPreserved: true, domGrowthReduced: false, conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false,
  limitations: ["This alternating universal-gzip/remux control is not media-to-media conversion progress.", "Layout/recalculation did not improve. Identical DOM growth does not prove a retained leak or a native-memory fix.", "Different browser instances and GC timing preclude attributing heap differences to this change."],
  sourcePins: { "scripts/freeze-ui-matrix-benchmark.mjs": sha(await readFile(new URL(import.meta.url))) } };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 32768);
await writeFile(path.join(root, "evidence/ui-matrix-benchmark-2026-10-07.json"), json, { flag: "wx" });
console.log(JSON.stringify({ baselineScriptMs: runs[0].totalScriptMs, candidateScriptMs: runs[1].totalScriptMs, reductionPercent: proof.scriptCpuReductionPercent }));
