// Private compound candidate: real recorded decoder + real plane-reuse encoder.
import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { verifyEncoderPlaneBuildEvidence } from "./encoder-plane-browser-recipe.mjs";
const decoderSlot = "work/mpeg2-alignment16-38161556498", encoderSlot = "work/mpeg2-encoder-planes-38044000567";
export const ATTEMPT_MEDIA_FILES = ["scripts/lib/alignment16-plane-candidate.mjs", "scripts/lib/alignment16-media-recipe.mjs",
  "scripts/qualify-alignment16-media.mjs", "tests/alignment16-media.test.mjs", "scripts/lib/encoder-plane-recovery-browser-recipe.mjs",
  "evidence/2026-10-11T18-16-00-125Z-alignment16-abort-control.json",
  "evidence/2026-10-11T18-16-00-125Z-alignment16-abort-control-executed-sources.json",
  "evidence/mpeg2-encoder-plane-build-38044000567.json", "evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json",
  "evidence/late-pool-abort-control-2026-10-08.json", "evidence/late-pool-allocator-abort-control-2026-10-08.json",
  "evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json", "evidence/mpeg2-alignment16-hosted-cleanup-38161556498.json"];
export async function attemptMediaSourceFiles(root) {
  const receipt = JSON.parse(await readFile(path.join(root, ATTEMPT_MEDIA_FILES[6])));
  const files = [...new Set([...ATTEMPT_MEDIA_FILES, ...Object.keys(receipt.sourcePins)])];
  for (let i = 0; i < files.length; i++) {
    assert.ok(files.length <= 256);
    if (!files[i].endsWith(".mjs")) continue;
    const source = await readFile(path.join(root, files[i]), "utf8");
    for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const file = path.relative(root, path.resolve(root, path.dirname(files[i]), match[1])).replaceAll("\\", "/");
      assert.ok(file && !file.startsWith("../") && !path.isAbsolute(file)); if (!files.includes(file)) files.push(file);
    }
  }
  return files;
}
async function components(root) {
  const read = file => readFile(path.join(root, file)), json = async file => JSON.parse(await read(file));
  const witness = await json(ATTEMPT_MEDIA_FILES[6]), proofBytes = await read(witness.proof.path), proof = JSON.parse(proofBytes);
  assert.equal(sha(proofBytes), "bea77bd9a4ea9173e2e169c590a2b94318df25ecccd4204530763bf3c8106ea6");
  assert.equal(sha(proofBytes), witness.proof.sha256); assert.equal(proof.status, "passed-synthetic-abort-control");
  assert.equal(witness.failure, null); assert.deepEqual(witness.sourcePins, witness.postSourcePins);
  const zipped = await read(witness.archive.path); assert.equal(sha(zipped), witness.archive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), witness.archive.restoredSha256);
  const archive = JSON.parse(raw);
  for (const [file, hash] of Object.entries(witness.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash, file);
  }
  const decoderBytes = await read(witness.layout.build.path), decoder = JSON.parse(decoderBytes);
  assert.equal(sha(decoderBytes), witness.layout.build.sha256); assert.equal(decoder.run.conclusion, "success");
  assert.equal(decoder.manifest.alignment16.actualWasmSmoke.passed, 13);
  assert.equal(decoder.manifest.alignment16.separateEncoderSdkRestored, true);
  assert.equal(decoder.manifest.alignment16.heapLimitsRaised, false);
  assert.equal(decoder.manifest.allocationAttempt.allocatorPolicyChanged, true);
  const decoderBranchBytes = await read(witness.layout.branch.path), decoderBranch = JSON.parse(decoderBranchBytes);
  assert.equal(sha(decoderBranchBytes), witness.layout.branch.sha256); assert.equal(decoder.run.headSha, decoderBranch.commit);
  const encoderBytes = await read(ATTEMPT_MEDIA_FILES[7]), encoder = JSON.parse(encoderBytes);
  const encoderBranchBytes = await read(ATTEMPT_MEDIA_FILES[8]), encoderBranch = JSON.parse(encoderBranchBytes);
  verifyEncoderPlaneBuildEvidence(encoder, encoderBranch);
  const mixed = new Map();
  for (const [slot, build] of [[encoderSlot, encoder], [decoderSlot, decoder]]) for (const row of build.files) {
    const file = `${slot}/${row.file}`, bytes = await read(file); assert.equal(sha(bytes), row.sha256, file); assert.equal(bytes.length, row.bytes);
    if (row.file === "build-manifest.json") continue;
    if (slot === decoderSlot && ["split-encoder.mjs", "split-encoder.wasm", "encoder-initialization.json"].includes(row.file)) continue;
    mixed.set(row.file, { path: file, bytes: row.bytes, sha256: row.sha256 });
  }
  assert.equal(mixed.get("within-mpeg2-split.wasm").sha256, "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
  assert.equal(mixed.get("split-encoder.wasm").sha256, "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  const sources = {};
  for (const [build, branch] of [[encoder, encoderBranch], [decoder, decoderBranch]]) {
    for (const [file, hash] of Object.entries(build.manifest.sources)) {
      if (file === branch.workflow.path) { assert.equal(hash, branch.workflow.generatedSha256); continue; }
      if (Object.hasOwn(sources, file)) assert.equal(sources[file], hash, "Shared build sources must agree");
      assert.equal(sha(await read(file)), hash, file); sources[file] = hash;
    }
    assert.equal(sha(await read(branch.workflow.path)), branch.workflow.canonicalSha256);
  }
  const manifest = { ...encoder.manifest, sources,
    artifacts: Object.fromEntries([...mixed].map(([file, row]) => [file, row.sha256])),
    allocationAttempt: decoder.manifest.allocationAttempt,
    alignment16: decoder.manifest.alignment16,
    provenance: { ...encoder.manifest.provenance, decoder: { run: decoder.run.databaseId, commit: decoderBranch.commit,
      workflowSha256: decoderBranch.workflow.generatedSha256, buildPath: witness.layout.build.path, buildSha256: sha(decoderBytes) } },
    componentProofs: { decoder: { path: witness.layout.build.path, sha256: sha(decoderBytes) },
      encoder: { path: ATTEMPT_MEDIA_FILES[7], sha256: sha(encoderBytes) },
      compositeObserver: { path: witness.proof.path, sha256: sha(proofBytes) } } };
  assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
  assert.deepEqual(manifest.memories.decoderMux, decoder.manifest.memories.decoderMux);
  return { manifest, mixed, decoder, encoder };
}
export async function createAttemptPlaneCandidate(root, directory) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  const { manifest, mixed } = await components(root);
  for (const [file, row] of mixed) { const target = path.join(directory, file); await copyFile(path.join(root, row.path), target, 1); assert.equal(sha(await readFile(target)), row.sha256); }
  await writeFile(path.join(directory, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { manifest, files: Object.fromEntries(mixed), bytes: [...mixed.values()].reduce((sum, row) => sum + row.bytes, 0), publicAcceptance: false };
}
export async function verifyAttemptPlaneCandidate(root, directory) {
  assert.equal(path.dirname(directory), path.join(root, "work")); const { manifest, mixed } = await components(root);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "build-manifest.json"))), manifest);
  for (const [file, row] of mixed) assert.equal(sha(await readFile(path.join(directory, file))), row.sha256, file);
  assert.deepEqual(manifest.memories.decoderMux, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(manifest.memories.encoder, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  return manifest;
}

