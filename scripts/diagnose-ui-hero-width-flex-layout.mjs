// NEW candidate, same actual bounded paired workflow; never rerun the rejected CSS.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { makeUiHeroWidthFlexLayoutControl } from "./lib/ui-hero-width-flex-layout-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/diagnose-ui-matrix-flex-layout.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-08T11-27-43-052Z-ui-hero-flex-layout.json")));
assert.equal(prior.status, "candidate-layout-rejected");
for (const [file, hash] of Object.entries(prior.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ["makeUiMatrixFlexLayoutControl", "makeUiHeroWidthFlexLayoutControl"],
  ['./lib/ui-matrix-flex-layout-recipe.mjs', './lib/ui-hero-width-flex-layout-recipe.mjs'],
  ['const paths = ["scripts/diagnose-ui-matrix-flex-layout.mjs",',
    'const paths = ["scripts/diagnose-ui-hero-width-flex-layout.mjs", "scripts/lib/ui-hero-width-flex-layout-recipe.mjs", "scripts/diagnose-ui-hero-flex-layout.mjs", "scripts/lib/ui-hero-flex-layout-recipe.mjs", "scripts/diagnose-ui-matrix-flex-layout.mjs",'],
  ["ui-matrix-flex-layout.json", "ui-hero-width-flex-layout.json"],
  ['"matrix-flex" : "matrix-grid"', '"hero-width-flex" : "hero-width-grid"'],
  ['"paired-matrix-layout-geometry-pass-not-public-acceptance"', '"paired-hero-width-layout-geometry-pass-not-public-acceptance"'],
  ['"failed-matrix-layout-control"', '"failed-hero-width-layout-control"'],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Actual source/60choices/trace caps/nine geometries/physical AND virtual host guard/cleanup/partial-type caveats preserved");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
if (process.argv[2] === "--prepare-only") {
  const helper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const input = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  const controls = [false, true].map(candidate => makeUiHeroWidthFlexLayoutControl(input, root, "file:///owned/attribution.mjs", candidate));
  const generatedHashes = {};
  for (const [name, value] of [["pair", generated], ["attribution", helper], ["baseline", controls[0]], ["candidate", controls[1]]]) {
    const check = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: value, encoding: "utf8", windowsHide: true });
    assert.equal(check.status, 0, check.stderr);
    generatedHashes[name] = { bytes: Buffer.byteLength(value), sha256: sha(value), syntaxCheckPassed: true };
  }
  const files = [...new Set([...Object.keys(prior.sourcePins),
    "scripts/diagnose-ui-hero-width-flex-layout.mjs", "scripts/lib/ui-hero-width-flex-layout-recipe.mjs",
    "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/host-memory-preflight.mjs",
    "tests/ui-hero-width-flex-layout-recipe.test.mjs", "evidence/2026-10-08T11-27-43-052Z-ui-hero-flex-layout.json"])];
  const sourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))])));
  const host = await inspectStressHostMemory();
  const report = { recordedAt: new Date().toISOString(), status: "prepared-syntax-and-source-verified-not-browser-executed",
    changedReason: "Rejected zero-basis hero flex widened desktop card34.9375CSSpx; explicit border-box weighted widths now match .86:1 grid/min30rem/mobilesource geometry",
    sourcePins, generatedHashes, host, originalSourceChanged: false, publishedFilesChanged: false,
    browserExecutions: 0, generatedMediaCopies: 0, candidateGeometryAccepted: null, memoryAcceptance: false,
    conversionSpeedAcceptance: false, publicAcceptance: false,
    nextGate: "Same actual bounded 60-selection two-trace A/B and nine geometries when physical AND virtual free memory are >=2GiB; do not launch full original until geometry and headed golden/recovery gates pass" };
  const target = path.join(root, "evidence/ui-hero-width-flex-preparation-2026-10-08.json");
  await assert.rejects(access(target), { code: "ENOENT" });
  const json = JSON.stringify(report, null, 2) + "\n";
  assert.ok(Buffer.byteLength(json) < 65536);
  await writeFile(target, json, { flag: "wx" });
  console.log(JSON.stringify({ target, status: report.status, host, generatedHashes }));
} else {
const runtime = await createOwnedRuntimeScratch("ui-hero-width-pair-wrapper-");
try { const target = path.join(runtime.directory, "pair.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
}
