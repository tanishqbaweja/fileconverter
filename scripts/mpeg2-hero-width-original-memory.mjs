// ONE new full-source candidate, never an unchanged replay of the251.484375MiB failure.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const sourcePath = "scripts/mpeg2-matrix-original-memory.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-matrix-original-2026-10-08.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ['evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-golden-validation.json', 'evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-golden-validation.json'],
  ['evidence/2026-10-08T08-38-48-399Z-ui-matrix-flex-layout-analysis.json', 'evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout-analysis.json'],
  ['verified-terminal-matrix-layout-pair-not-public-acceptance', 'verified-terminal-hero-width-layout-pair-not-public-acceptance'],
  ['makeMatrixOriginalDriver', 'makeHeroWidthOriginalDriver'],
  ['./lib/mpeg2-matrix-original-recipe.mjs', './lib/mpeg2-hero-width-original-recipe.mjs'],
  ['evidence/mpeg2-matrix-original-2026-10-08.json', 'evidence/mpeg2-hero-width-original-2026-10-08.json'],
  ['mpeg2-matrix-original-driver-', 'mpeg2-hero-width-original-driver-'],
  ['mpeg2-matrix-original-wrapper-', 'mpeg2-hero-width-original-wrapper-'],
  ['-matrix-original-partial-blink-trace.json.gz', '-hero-width-original-partial-blink-trace.json.gz'],
  ['changed-matrix-original-preflight', 'changed-hero-width-original-preflight'],
  ['terminal-private-full-original-matrix-diagnostic-not-acceptance', 'terminal-private-full-original-hero-width-diagnostic-not-acceptance'],
  ['mpeg2-matrix-launch-wrapper-', 'mpeg2-hero-width-launch-wrapper-'],
];
let generated = source;
for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source, "Actual full-source SHA/golden/core/layout/disk/host/blank/memory/three-run/quality/validators/cancel/finally gates retained");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
if (process.argv[2] === "--prepare-only") {
  const check = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(check.status, 0, check.stderr);
  const files = ["scripts/mpeg2-hero-width-original-memory.mjs", "scripts/lib/mpeg2-hero-width-original-recipe.mjs", sourcePath,
    "scripts/lib/mpeg2-matrix-original-recipe.mjs", "scripts/lib/ui-hero-width-flex-layout-recipe.mjs",
    "tests/mpeg2-hero-width-original-recipe.test.mjs", "evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-golden-validation.json",
    "evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout-analysis.json"];
  const sourcePins = Object.fromEntries(await Promise.all(files.map(async f => [f, sha(await readFile(path.join(root, f)))])));
  const proof = { recordedAt: new Date().toISOString(), status: "source-and-syntax-prepared-not-browser-executed",
    sourcePins, generatedHash: sha(generated), generatedBytes: Buffer.byteLength(generated), protectedSourceChanged: false,
    conversionsPerformed: 0, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
    changedReason: "Only new hero width CSS, verified9responsive geometries and5headed genuine golden/recovery cases; all protected full-source/defaults/250MiB/ALLprocesses/three-repeats/validators/finally remain" };
  const target = path.join(root, "evidence/mpeg2-hero-width-original-preparation-2026-10-08.json");
  await assert.rejects(access(target), { code: "ENOENT" });
  await writeFile(target, JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ target, ...proof }));
} else {
  const runtime = await createOwnedRuntimeScratch("mpeg2-hero-width-launch-wrapper-");
  try { const target = path.join(runtime.directory, "original.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
  finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
}
