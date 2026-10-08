// Exact previously executed bounded A/B workflow; hero CSS is the sole new candidate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/diagnose-ui-matrix-flex-layout.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-08T08-38-48-399Z-ui-matrix-flex-layout.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ["makeUiMatrixFlexLayoutControl", "makeUiHeroFlexLayoutControl"],
  ['./lib/ui-matrix-flex-layout-recipe.mjs', './lib/ui-hero-flex-layout-recipe.mjs'],
  ['const paths = ["scripts/diagnose-ui-matrix-flex-layout.mjs",',
    'const paths = ["scripts/diagnose-ui-hero-flex-layout.mjs", "scripts/lib/ui-hero-flex-layout-recipe.mjs", "scripts/diagnose-ui-matrix-flex-layout.mjs",'],
  ["ui-matrix-flex-layout.json", "ui-hero-flex-layout.json"],
  ['"matrix-flex" : "matrix-grid"', '"hero-flex" : "hero-grid"'],
  ['"paired-matrix-layout-geometry-pass-not-public-acceptance"', '"paired-hero-layout-geometry-pass-not-public-acceptance"'],
  ['"failed-matrix-layout-control"', '"failed-hero-layout-control"'],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated; for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Actual source/60choices/trace caps/geometry/host guard/cleanup/raw hashes/partial-type caveats preserved");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("ui-hero-pair-wrapper-");
try { const target = path.join(runtime.directory, "pair.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
