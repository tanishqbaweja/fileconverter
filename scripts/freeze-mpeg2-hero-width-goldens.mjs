// Independent exact-output freeze after all six current headed PNGs were reviewed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/freeze-mpeg2-matrix-goldens.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const failed = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-matrix-golden-freeze-size-failure-2026-10-08.json")));
assert.equal(sha(source), failed.sourcePins[sourcePath]);
const patches = [
  ['\nconst root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");',
    `\nconst root = ${JSON.stringify(root)}, sha = bytes => createHash("sha256").update(bytes).digest("hex");`],
  ['evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-goldens.json', 'evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-goldens.json'],
  ['evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-golden-validation.json', 'evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-golden-validation.json'],
  ['matrixUiObservations:${JSON.stringify(ui)}',
    'matrixUiObservations:${JSON.stringify(ui.map(r=>({observationPhase:r.observationPhase,jobState:r.jobState,matrixCards:r.matrixCards,overflow:r.overflow,matrixSha256:r.matrixSha256,outputBytes:r.metrics.outputBytes,screenshot:r.screenshot,allInspectedGeometryPositive:true})))}'],
  ['mpeg2-matrix-golden-freeze-', 'mpeg2-hero-width-golden-freeze-'],
];
let generated = source;
for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source, "Only new actual envelope/output binding/compact UI summary/owned name; ALL full raw/UI/screenshots/goldens/quality/PCM/timeline/recovery/cleanup assertions and32KiB cap retained");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-hero-width-freeze-wrapper-");
try { const target = path.join(runtime.directory, "freeze.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
