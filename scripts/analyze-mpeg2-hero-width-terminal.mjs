// Exact independent verifier, bound only to this actual terminal hero attempt.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const sourcePath = "scripts/analyze-mpeg2-late-allocator-terminal.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const launch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-hero-width-original-launch-2026-10-08.json")));
assert.equal(launch.sessionId, 49484);
assert.deepEqual(launch.observedProcesses.map(p => p.pid), [46840, 36240, 14700]);
const patches = [
  ['const root=path.resolve(import.meta.dirname,".."),MiB=', `const root=${JSON.stringify(root)},MiB=`],
  ['evidence/mpeg2-late-allocator-original-2026-10-08.json', 'evidence/mpeg2-hero-width-original-2026-10-08.json'],
  [String.raw`263\.64453125MiB`, String.raw`256\.43359375MiB`],
  ['263.64453125', '256.43359375'], ['244310016', '242388992'], ['520761344', '511279104'],
  ['32859713', '33711681'], ['21072617', '22959384'], ['1515', '1631'],
  ['assert.equal(p.runs[0].state.jobState,"cancelled");',
    'assert.equal(p.runs[0].state.jobState,"cancelled");assert.equal(p.quiescedBudgetCapture.stateAfter.jobState,"cancelled");'],
  ['56823808', '40828928'], ['26280', '20320'], ['56807424', '40828928'],
  ['118423552', '116854784'], ['64356432', '65667152'], ['11844872', '7781760'], ['44302336', '51380224'], ['3794944', '527520'],
  ['assert.match(delayed.blinkTypeStatistics[0].type,/GridSizingTrackCollection/);', 'assert.match(delayed.blinkTypeStatistics[0].type,/LayoutResult/);'],
  ['helpers=[43328,43804,p.ownedPids.server,p.ownedPids.observer]', 'helpers=[46840,36240,p.ownedPids.server,p.ownedPids.observer]'],
  ['path.join(root,"work/mpeg2-late-allocator-original-wrapper-KbNYUe")',
    'path.join(root,"work/mpeg2-hero-width-original-wrapper-SWJMWf"),path.join(root,"work/mpeg2-hero-width-launch-wrapper-eyKxh9"),path.join(root,"work/mpeg2-hero-width-launch-wrapper-J7UfmK")'],
  ['allThreeOwnedRuntimeDirectoriesAbsent', 'allFiveOwnedRuntimeDirectoriesAbsent'],
  ['scripts/analyze-mpeg2-late-allocator-terminal.mjs', 'scripts/analyze-mpeg2-hero-width-terminal.mjs'],
  ['evidence/mpeg2-late-allocator-terminal-analysis-2026-10-08.json', 'evidence/mpeg2-hero-width-terminal-analysis-2026-10-08.json'],
  ['Investigate the observed renderer delta and delayed Blink layout/pool records with a changed bounded production UI candidate before another full-original attempt.',
    'Hero width CSS lowers diagnostic object growth but fails the actual full-original256.43359375MiB gate. Investigate native renderer allocation stacks/retention with a NEW bounded diagnostic before another original; no unchanged replay or further CSS guess.'],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Same complete raw/generated/source hashes/formula/ALLprocess delta/trace/gzip+reparse/native births/restore/protected full SHA gates; actual terminal constants/five owned dirs/types only differ");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-hero-width-terminal-analysis-");
try { const target = path.join(runtime.directory, "analyze.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
