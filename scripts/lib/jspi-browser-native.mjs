import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readWasmFunctionMetadata } from "./wasm-function-metadata.mjs";
import { loadUpdatedChromeQualification } from "./updated-chrome-qualification.mjs";
export const JSPI_DECODER_SHA256 = "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57";
export const JSPI_NATIVE_PROOF = "evidence/jspi-native-sources-39072949964.json";
export async function loadJspiBrowserNative(root) {
  const read = file => readFile(path.join(root, file));
  const proofBytes = await read(JSPI_NATIVE_PROOF), proof = JSON.parse(proofBytes);
  const buildBytes = await read(proof.proof.path); assert.equal(sha(buildBytes), proof.proof.sha256); const build = JSON.parse(buildBytes);
  const branchBytes = await read(proof.branch.path); assert.equal(sha(branchBytes), proof.branch.sha256); const branch = JSON.parse(branchBytes);
  assert.equal(proof.executedHead, build.run.headSha); assert.equal(branch.commit, build.run.headSha); assert.equal(build.run.conclusion, "success");
  assert.equal(proof.sourceCount, 132); assert.equal(proof.allSourcesMatchedExecutedGitHead, true); assert.equal(proof.workflowCanonicalDiffOnly, true);
  assert.deepEqual(proof.layers.map(row => row.sourceCount), [126, 6]); const sources = {};
  for (const layer of proof.layers) {
    assert.ok(layer.sourceCount <= 128); const zipped = await read(layer.archive.path);
    assert.equal(zipped.length, layer.archive.bytes); assert.equal(sha(zipped), layer.archive.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(raw.length, layer.archive.restoredBytes); assert.equal(sha(raw), layer.archive.restoredSha256);
    const archive = JSON.parse(raw); assert.deepEqual(archive.sourcePins, layer.sourcePins); assert.deepEqual(archive.currentSourcePins, layer.currentSourcePins);
    assert.equal(Object.keys(archive.preimages).length, layer.sourceCount);
    for (const [file, digest] of Object.entries(layer.sourcePins)) {
      assert.equal(Object.hasOwn(sources, file), false); sources[file] = digest;
      const bytes = Buffer.from(archive.preimages[file], "base64"); assert.equal(sha(bytes), digest);
      assert.equal(sha(await read(file)), layer.currentSourcePins[file], file);
      if (file === branch.workflow.path) {
        assert.equal(bytes.toString(), branch.workflow.generatedExactSource); assert.equal(sha(bytes), branch.workflow.generatedSha256);
        assert.equal(sha(await read(file)), branch.workflow.canonicalSha256);
      } else assert.equal(sha(await read(file)), digest, file);
    }
  }
  assert.deepEqual(sources, build.manifest.sources);
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
  const directory = "work/mpeg2-jspi-39072949964"; assert.equal(build.files.length, 20);
  for (const row of build.files) {
    assert.equal(path.basename(row.file), row.file); const bytes = await read(`${directory}/${row.file}`);
    assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  }
  const binary = await read(`${directory}/within-mpeg2-split.wasm`); assert.equal(sha(binary), JSPI_DECODER_SHA256);
  assert.deepEqual(readWasmMemoryLimits(binary), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  const functions = readWasmFunctionMetadata(binary, new Set(proof.functions.map(row => row.name)))
    .map(row => ({ ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) }));
  assert.deepEqual(functions, proof.functions);
  const parentBinary = await read("work/mpeg2-duration-drain-38678806473/within-mpeg2-split.wasm");
  assert.equal(sha(parentBinary), "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e");
  assert.deepEqual(readWasmFunctionMetadata(parentBinary, new Set(proof.functions.map(row => row.name)))
    .map(row => ({ ...row, bodySha256: sha(parentBinary.subarray(row.bodyStart, row.bodyEnd)) })), proof.parentFunctions);
  assert.deepEqual(proof.layout, { _gm_: { address: 1786904, bytes: 496 }, within_allocator_attempt_words: { address: 1918992, bytes: 64 },
    within_realloc_attempt_words: { address: 1919056, bytes: 64 }, within_refstruct_abort_words: { address: 1919120, bytes: 64 } });
  return { proof, build, directory, functions, envelope: { path: JSPI_NATIVE_PROOF, sha256: sha(proofBytes), sourceCount: 132,
    layers: proof.layers.map(({ label, sourceCount, archive }) => ({ label, sourceCount, archive })), allExecutedNativePreimagesVerified: true, publicAcceptance: false } };
}
export async function makeJspiBrowserComposition(root, qualified) {
  qualified ??= await loadUpdatedChromeQualification(root);
  const native = await loadJspiBrowserNative(root), previous = qualified.historical.generated.composition;
  const files = structuredClone(previous.files), manifest = structuredClone(previous.manifest);
  const excluded = new Set(["build-manifest.json", "split-encoder.mjs", "split-encoder.wasm", "encoder-initialization.json"]);
  for (const row of native.build.files) {
    if (excluded.has(row.file)) continue;
    assert.ok(Object.hasOwn(files, row.file), "Do not introduce unrelated artifacts");
    files[row.file] = { path: `${native.directory}/${row.file}`, bytes: row.bytes, sha256: row.sha256 }; manifest.artifacts[row.file] = row.sha256;
  }
  assert.equal(files["split-encoder.wasm"].sha256, "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  for (const [file, digest] of Object.entries(native.build.manifest.sources)) {
    if (file === ".github/workflows/reproduce-ffmpeg-nondocker.yml") continue;
    if (manifest.sources[file]) assert.equal(manifest.sources[file], digest, file); manifest.sources[file] = digest;
  }
  delete manifest.asyncifyStorage; delete manifest.reallocComposition; delete manifest.durationDrainComposition;
  manifest.scope = "private-jspi-decoder-with-qualified-plane-encoder-not-public-acceptance";
  manifest.asyncifyStackBytesDecoder = 0; manifest.jspi = structuredClone(native.build.manifest.jspi);
  manifest.componentProofs.decoder = native.proof.proof; manifest.componentProofs.nativeExecutedSources = native.envelope;
  manifest.componentProofs.compositeObserver = { staticAbiVerified: true, actualRuntimeFatalRequalified: false, oldFunctionIndicesUsed: false };
  manifest.provenance.decoder = { run: native.build.run.databaseId, commit: native.build.run.headSha,
    buildPath: native.proof.proof.path, buildSha256: native.proof.proof.sha256 };
  manifest.jspiComposition = { parentQualifiedMedia: qualified.reference, nativeEnvelope: native.envelope,
    qualifiedPlaneEncoderPreserved: true, qualifiedPlaneEncoderSha256: files["split-encoder.wasm"].sha256,
    fixedWasmMemoryBytes: 50331648, codecSettingsChanged: false, productionIoChanged: false,
    engineManagedStackBytes: null, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false };
  return { manifest, files, native, previous, qualified };
}
export async function copyJspiBrowserCandidate(root, directory, qualified) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  const composition = await makeJspiBrowserComposition(root, qualified);
  for (const [file, row] of Object.entries(composition.files)) {
    assert.equal(path.basename(file), file); const bytes = await readFile(path.join(root, row.path));
    assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
    await writeFile(path.join(directory, file), bytes, { flag: "wx" });
  }
  await writeFile(path.join(directory, "build-manifest.json"), JSON.stringify(composition.manifest, null, 2) + "\n", { flag: "wx" });
  return composition;
}
export async function verifyJspiBrowserCandidate(root, directory) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  const expected = await makeJspiBrowserComposition(root);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "build-manifest.json"))), expected.manifest);
  for (const [file, row] of Object.entries(expected.files)) {
    const bytes = await readFile(path.join(directory, file)); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  }
  return expected.manifest;
}
