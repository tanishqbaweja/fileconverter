// Stage ONLY compiled unmodified3e744 core + failure observer in generated dist.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeLateAbortAdapter } from "./lib/mpeg2-late-abort-adapter.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(["stage", "restore"].includes(process.argv[2]) && process.argv.length === 3);
assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, "mpeg2-split-pipeline-37739125738");
const stager = await readFile(path.join(root, "scripts/stage-mpeg2-split-direct.mjs"), "utf8");
const { original, adapter } = makeLateAbortAdapter({ stager,
  stackHelper: await readFile(path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "utf8"),
  snapshotHelper: await readFile(path.join(root, "scripts/lib/late-refstruct-abort-snapshot.mjs"), "utf8"),
  poolHelper: await readFile(path.join(root, "scripts/lib/late-pool-abort-capture.mjs"), "utf8"),
  controlProof: JSON.parse(await readFile(path.join(root, "evidence/late-pool-abort-control-2026-10-08.json"))) });
const beforeAdapter = "const adapter = `" + original + "`;";
const beforeSources = "for (const [file, digest] of Object.entries(manifest.sources)) assert.equal(await hash(path.join(root, file)), digest, file);";
const afterSources = `assert.equal(manifest.scope,"private-fixed-heap-late-refstruct-request-diagnostic-not-acceptance");
assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],"3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c");
assert.equal(manifest.lateRefstruct.actualSyntheticWasm32Unit.freshRequestsObserved,82);
assert.equal(manifest.lateRefstruct.fixedSlotBytes,64);
for (const [file, digest] of Object.entries(manifest.sources)) {
  if(file===".github/workflows/reproduce-ffmpeg-nondocker.yml") {
    const canonical=await readFile(path.join(root,file),"utf8");
    assert.equal(sha(canonical),"cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965");
    assert.equal(digest,"d280472ff4421e744aa767d9d690a7b73d82a26951bb71446c3fb3d55cacd78d");
    assert.equal(sha(makeLateSlotBuildWorkflow(canonical)),digest);
  } else assert.equal(await hash(path.join(root,file)),digest,file);
}`;
const patches = [
  [beforeAdapter, "const adapter = " + JSON.stringify(adapter) + ";"],
  ['const root = path.resolve(import.meta.dirname, ".."), name =', `const root = ${JSON.stringify(root)}, name =`],
  [beforeSources, afterSources],
];
let generated = stager;
for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let reverse = generated;
for (const [before, after] of patches.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
assert.equal(reverse, stager, "All exclusive creation/hash/restore/finally behavior preserved");
generated = `import {makeLateSlotBuildWorkflow} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/late-slot-build-workflow.mjs")).href)};\n` + generated;
const runtime = await createOwnedRuntimeScratch("mpeg2-late-abort-stager-");
try {
  const target = path.join(runtime.directory, "stage.mjs"); await writeFile(target, generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); }
