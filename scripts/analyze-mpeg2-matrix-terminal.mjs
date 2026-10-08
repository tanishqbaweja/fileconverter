// Same independently executed verifier, bound to this actual terminal run only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/analyze-mpeg2-late-allocator-terminal.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const launch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-matrix-original-launch-2026-10-08.json")));
assert.equal(launch.sessionId, 83524); assert.equal(launch.runner.pid, 34604); assert.equal(launch.chrome.pid, 31168);
const patches = [
  ['const root=path.resolve(import.meta.dirname,".."),MiB=', `const root=${JSON.stringify(root)},MiB=`],
  ["evidence/mpeg2-late-allocator-original-2026-10-08.json", "evidence/mpeg2-matrix-original-2026-10-08.json"],
  [String.raw`263\.64453125MiB`, String.raw`251\.484375MiB`],
  ["263.64453125", "251.484375"], ["244310016", "241549312"], ["520761344", "505249792"],
  ["32859713", "33777217"], ["21072617", "23214284"], ["1515", "1721"],
  ['assert.equal(p.runs[0].state.jobState,"cancelled");',
    'assert.equal(p.runs[0].state.jobState,"running","Actual saved UI snapshot is not terminal liveness");\nassert.equal(p.quiescedBudgetCapture.stateAfter.jobState,"cancelled","Actual normal post-cancel state independently required");'],
  ['p.nativeFailureCapture.unavailableSamples,0', 'p.nativeFailureCapture.unavailableSamples,1'],
  ["56823808", "57626624"], ["26280", "37936"], ["56807424", "57622528"],
  ["118423552", "114020352"], ["64356432", "65405008"], ["11844872", "11639608"],
  ["44302336", "49545216"], ["3794944", "1757952"],
  ["helpers=[43328,43804,p.ownedPids.server,p.ownedPids.observer]", "helpers=[33784,34604,p.ownedPids.server,p.ownedPids.observer]"],
  ['path.join(root,"work/mpeg2-late-allocator-original-wrapper-KbNYUe")',
    'path.join(root,"work/mpeg2-matrix-original-wrapper-rQP4zi"),path.join(root,"work/mpeg2-matrix-launch-wrapper-sOfF9k")'],
  ["allThreeOwnedRuntimeDirectoriesAbsent", "allFourOwnedRuntimeDirectoriesAbsent"],
  ["scripts/analyze-mpeg2-late-allocator-terminal.mjs", "scripts/analyze-mpeg2-matrix-terminal.mjs"],
  ["evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json", "evidence/mpeg2-matrix-terminal-analysis-2026-10-08.json"],
  ['globalTraceReconstructionAndReparseVerified:true,globalDumpSucceeded:true,',
    'globalTraceReconstructionAndReparseVerified:true,globalDumpSucceeded:true,\n  nativeUnavailableSamples:p.nativeFailureCapture.unavailableSamples,missingSamplesNeverZero:true,\n  lastSavedRunJobState:p.runs[0].state.jobState,actualPostCancelJobState:p.quiescedBudgetCapture.stateAfter.jobState,'],
  ['Investigate the observed renderer delta and delayed Blink layout/pool records with a changed bounded production UI candidate before another full-original attempt.',
    'Fully rendered matrix candidate still fails250MiB. Investigate remaining ancestor hero-grid/layout allocation with a changed bounded UI pair before another original attempt; never retry this unchanged candidate.'],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated; for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Same raw/generated/source/hash/formula/ALL-process delta/trace/gzip reparse/native identity/restore/full protected SHA gates; only actual run constants/provenance/four owned dirs differ");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-matrix-terminal-analysis-");
try { const target = path.join(runtime.directory, "analyze.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
