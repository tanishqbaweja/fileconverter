// ONE changed full protected-source attempt gated by actual headed conversion proof.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const goldenPath = "evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-golden-validation.json";
const golden = JSON.parse(await readFile(path.join(root, goldenPath)));
assert.equal(golden.status, "passed-5-of-5-private-regression");
assert.equal(golden.matrixUiObservations.length, 6); assert.equal(golden.visualReview.reviewedScreenshots.length, 6);
assert.equal(golden.independentCleanup.allObservedPidsAbsent, true);
assert.equal(golden.originalCompiledCoreSha256, "3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
assert.equal(golden.syntheticExportControlUsedForMedia, false);
for (const [file, hash] of Object.entries(golden.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const layout = JSON.parse(await readFile(path.join(root, "evidence/2026-10-08T08-38-48-399Z-ui-matrix-flex-layout-analysis.json")));
assert.equal(layout.status, "verified-terminal-matrix-layout-pair-not-public-acceptance");
assert.equal(layout.candidateGeometryAccepted, true); assert.equal(layout.cleanup.protectedFullPostHashMatches, true);
const sourcePath = "scripts/mpeg2-late-allocator-original-memory.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const previous = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-late-allocator-original-2026-10-08.json")));
assert.equal(sha(source), previous.sourcePins[sourcePath]);
const patches = [
  ['const root=path.resolve(import.meta.dirname,".."),sha=', `const root=${JSON.stringify(root)},sha=`],
  ['"evidence/mpeg2-late-allocator-abort-golden-validation-2026-10-08.json"', JSON.stringify(goldenPath)],
  ["makeLateAllocatorOriginalDriver", "makeMatrixOriginalDriver"],
  ["./lib/mpeg2-late-allocator-original-recipe.mjs", "./lib/mpeg2-matrix-original-recipe.mjs"],
  ["evidence/mpeg2-late-allocator-original-2026-10-08.json", "evidence/mpeg2-matrix-original-2026-10-08.json"],
  ["mpeg2-late-allocator-original-driver-", "mpeg2-matrix-original-driver-"],
  ["mpeg2-late-allocator-original-wrapper-", "mpeg2-matrix-original-wrapper-"],
  ["-late-allocator-original-partial-blink-trace.json.gz", "-matrix-original-partial-blink-trace.json.gz"],
  ["changed-late-allocator-original-preflight", "changed-matrix-original-preflight"],
  ["terminal-private-full-original-late-allocator-diagnostic-not-acceptance", "terminal-private-full-original-matrix-diagnostic-not-acceptance"],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated; for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Only measured CSS recipe/golden proof/provenance/report names; ALL original full-source gates preserved");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-matrix-launch-wrapper-");
try { const target = path.join(runtime.directory, "original.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
