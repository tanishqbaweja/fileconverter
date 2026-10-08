// Exact previous headed five-case driver with the newly geometry-verified hero CSS.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const sourcePath = "scripts/validate-mpeg2-matrix-goldens.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-goldens.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const pairPath = "evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout-analysis.json";
const pair = JSON.parse(await readFile(path.join(root, pairPath)));
assert.equal(pair.status, "verified-terminal-hero-width-layout-pair-not-public-acceptance");
assert.equal(pair.candidateGeometryAccepted, true); assert.equal(pair.cleanup.protectedFullPostHashMatches, true);
for (const [file, hash] of Object.entries(pair.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ["makeMatrixGoldenSpec", "makeHeroWidthGoldenSpec", 2], ["makeMatrixGoldenDriver", "makeHeroWidthGoldenDriver", 2],
  ['./lib/mpeg2-matrix-golden-recipe.mjs', './lib/mpeg2-hero-width-golden-recipe.mjs'],
  ['["scripts/validate-mpeg2-matrix-goldens.mjs", "scripts/lib/mpeg2-matrix-golden-recipe.mjs",',
    '["scripts/validate-mpeg2-hero-width-goldens.mjs", "scripts/lib/mpeg2-hero-width-golden-recipe.mjs", "scripts/lib/ui-hero-width-flex-layout-recipe.mjs", "scripts/lib/ui-hero-flex-layout-recipe.mjs", "scripts/validate-mpeg2-matrix-goldens.mjs", "scripts/lib/mpeg2-matrix-golden-recipe.mjs", "evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout-analysis.json",'],
  ['-mpeg2-matrix-goldens.json', '-mpeg2-hero-width-goldens.json'],
  ['mpeg2-matrix-goldens-wrapper-', 'mpeg2-hero-width-goldens-wrapper-'],
];
let generated = source;
for (const [before, after, occurrences = 1] of patches) { assert.equal(generated.split(before).length, occurrences + 1, before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Exact headed5tests/sourcepins/disk/host/normalcore/golden/finally/reportcaps remain");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-hero-width-golden-launch-");
try { const target = path.join(runtime.directory, "run.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
