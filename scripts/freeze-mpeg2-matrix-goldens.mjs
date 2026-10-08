// Independently verify exact old goldens, actual headed UI records and cleanup.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const envelopePath = "evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-goldens.json";
const envelopeBytes = await readFile(path.join(root, envelopePath)), e = JSON.parse(envelopeBytes);
assert.equal(e.status, "headed-browser-suite-success-awaiting-independent-freeze-and-visual-review");
assert.equal(e.failure, null); assert.equal(e.pinsUnchanged, true); assert.equal(e.reports.length, 1);
assert.deepEqual(e.sourcePins, e.postSourcePins);
for (const [file, hash] of Object.entries(e.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
for (const [name, source] of Object.entries(e.generatedSources)) assert.equal(sha(source), e.generatedHashes[name]);
await assert.rejects(access(e.ownedWrapper), { code: "ENOENT" });
const record = e.reports[0], raw = await readFile(path.join(root, record.path)), report = JSON.parse(raw);
assert.equal(raw.length, record.bytes); assert.equal(sha(raw), record.sha256);
const ui = report.rows.filter(r => r.kind === "matrix-ui-observation");
assert.equal(ui.length, 6); assert.deepEqual(ui.map(r => r.jobState), ["complete", "complete", "complete", "error", "running", "cancelled"]);
for (const r of ui) {
  assert.equal(r.matrixCards, 405); assert.equal(r.overflow, false);
  assert.equal(r.matrixSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
  assert.ok(r.rows.length > 0 && r.rows.length < 32); assert.ok(r.rows.every(g => g.width > 0 && g.height > 0));
  const imagePath = path.resolve(root, r.screenshot.path); assert.equal(path.dirname(imagePath), path.join(root, "output", "playwright"));
  const image = await readFile(imagePath); assert.equal(image.length, r.screenshot.bytes); assert.equal(sha(image), r.screenshot.sha256);
}
assert.ok(ui[4].metrics.outputBytes > 32768); assert.equal(ui[4].observationPhase, "real-output-before-cancel");
const styles = report.rows.filter(r => r.kind === "matrix-static-stylesheet"); assert.equal(styles.length, 5);
assert.ok(styles.every(s => s.records.length === 1));
assert.equal(new Set(styles.map(s => s.records[0].beforeSha256)).size, 1);
assert.equal(new Set(styles.map(s => s.records[0].afterSha256)).size, 1);
const pids = [...new Set(report.rows.flatMap(r => r.samples ?? []).flatMap(s => s.processes ?? []).map(p => p.pid))];
assert.ok(pids.length > 0 && pids.length <= 128);
const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{pid=$_.ProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
assert.ok(current.every(p => Date.parse(p.createdAt) > Date.parse(e.recordedAt)), "Observed PID absent or definitively reused after execution; legacy sampler has no birth");
const wasm = await readFile(path.join(root, "work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm"));
assert.equal(sha(wasm), "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
assert.ok(!WebAssembly.Module.exports(new WebAssembly.Module(wasm)).some(r => r.name.startsWith("control_")));
const sourcePath = "scripts/freeze-mpeg2-abort-golden-regression.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-abort-golden-regression-2026-10-08.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const start = source.indexOf("const sourcePins = {};"), end = source.indexOf("const proof = ");
assert.ok(start > 0 && end > start);
const output = "evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-golden-validation.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const visualReview = { reviewedScreenshots: ui.map(r => r.screenshot), readableMetricsAndButtons: true,
  noOverlappingOrClippedMetricsObserved: true, actualRunningCancelAndTerminalStatesReviewed: true,
  errorMessageVisible: "The destination rejected a bounded write.",
  caveat: "Reviewed all six desktop viewport PNGs. No keyboard/mobile/nativeOS-picker/full matrix screenshot certification. Existing private substituted-adapter UI still labels public MPEG4/remux profiles, not the actual private MPEG2 codec; independent outputs prove MPEG2 and no public promotion is allowed with these labels." };
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ['"output/playwright/2026-10-07T18-59-08.077Z-mpeg2-split-pipeline-37479749443-direct-artwork.json"', JSON.stringify(record.path)],
  ['"mpeg2-split-pipeline-37479749443"', '"mpeg2-split-pipeline-37739125738"'],
  [source.slice(start, end), `const sourcePins = ${JSON.stringify(e.sourcePins)};\nfor(const [file,hash] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root,file))),hash);\n`],
  ["elapsedBrowserTestSeconds: 26.1", "elapsedBrowserTestSeconds: null"],
  ['"evidence/mpeg2-abort-golden-regression-2026-10-08.json"', JSON.stringify(output)],
  ['"Current files verified at freeze; legacy raw browser report does not contain executed App source pins. Candidate App identity also has independently pinned UI benchmark evidence."',
    '"Actual pre/post execution source pins and generated headed spec/driver/config verified; no transferred prior elapsed benchmark."'],
  ['  completeChromiumMemoryAcceptance: false,', `  matrixUiObservations:${JSON.stringify(ui)}, matrixStylesheets:${JSON.stringify(styles)}, visualReview:${JSON.stringify(visualReview)},
  independentCleanup:{observedPidCount:${pids.length},allObservedPidsAbsent:${current.length === 0},observedProcesses:${JSON.stringify(current)},nativeBirthsUnavailable:true,ownedWrapperAbsent:true},
  executionEnvelope:{path:${JSON.stringify(envelopePath)},bytes:${envelopeBytes.length},sha256:${JSON.stringify(sha(envelopeBytes))}},
  freezerSourceSha256:${JSON.stringify(sha(await readFile(new URL(import.meta.url))))},originalCompiledCoreSha256:${JSON.stringify(sha(wasm))},syntheticExportControlUsedForMedia:false,
  completeChromiumMemoryAcceptance: false,`],
];
let generated = source;
for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before.slice(0, 80)); generated = generated.replace(before, after); }
let reversed = generated; for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source, "All exact goldens/frame/PCM/timeline/artwork/recovery/6asset/9addition assertions preserved");
const runtime = await createOwnedRuntimeScratch("mpeg2-matrix-golden-freeze-");
try { const target = path.join(runtime.directory, "freeze.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
console.log(JSON.stringify({ output, uiStates: ui.map(r => r.jobState), observedPidCount: pids.length, allObservedPidsAbsent: current.length === 0 }));
