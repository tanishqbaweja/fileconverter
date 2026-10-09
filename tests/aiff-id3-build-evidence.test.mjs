import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/aiff-id3-specialist-build-37998603437.json"));
test("Actual private AIFF compile succeeded with immutable executed source, not browser/public acceptance", async () => {
  assert.equal(proof.run.databaseId, 37998603437); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.run.headSha, "20cf3cb851fd45225754e0a1e42be0343aabeaf1");
  assert.equal(proof.run.jobs[0].databaseId, 114050863894);
  for (const name of ["Rebuild and compare requested FFmpeg module(s)", "Retain private metadata-only AIFF specialist", "Remove repository-local build data"])
    assert.equal(proof.run.jobs[0].steps.find(step => step.name === name).conclusion, "success");
  assert.equal(proof.files.length, 12); assert.equal(proof.reusableToolBytes, 9148560);
  assert.equal(proof.actualWasmLimitsIndependentlyVerified, true); assert.equal(proof.compiledCMetadataEditsReversedExactly, true);
  assert.equal(proof.manifest.initialWasmMemoryBytes, 16777216); assert.equal(proof.manifest.maximumWasmMemoryBytes, 33554432);
  assert.equal(proof.downloadRuntimeRemoved, true);
  for (const key of ["publicAcceptance", "audioFidelityAcceptance", "completeChromiumMemoryAcceptance", "speedImprovementProven", "publishedAssetsChanged"])
    assert.equal(proof[key], false);
  assert.equal(proof.collectorSourceSha256, sha(await read("scripts/collect-aiff-id3-build.mjs")));
});
test("Exact redundant hosted archive deleted only after verified useful local tools", async () => {
  const clean = JSON.parse(await read("evidence/aiff-id3-hosted-cleanup-37998603437.json"));
  assert.equal(clean.buildProofSha256, sha(await read("evidence/aiff-id3-specialist-build-37998603437.json")));
  assert.equal(clean.before.total_count, 1); assert.equal(clean.before.artifacts[0].id, 11648103107);
  assert.equal(clean.exactArtifactId, 11648103107); assert.equal(clean.deletionPerformed, true);
  assert.equal(clean.after.total_count, 0); assert.deepEqual(clean.after.artifacts, []);
  assert.equal(clean.localToolsVerified, true); assert.equal(clean.localToolsRetainedForBrowserTests, true);
  assert.equal(clean.convertedFilesDeleted, 0); assert.equal(clean.originalReadOrChanged, false);
  assert.equal(clean.ownedRuntimeRemoved, true);
  assert.equal(clean.sourceSha256, sha(await read("scripts/cleanup-aiff-id3-hosted-artifact.mjs")));
});
test("Initial collection failure preserved; exactly reconstruct original too-small static-file assertion", async () => {
  const failed = JSON.parse(await read("evidence/aiff-id3-initial-collection-failure-2026-10-10.json"));
  assert.equal(failed.exitCode, 1); assert.equal(failed.failureFilenameAvailable, false);
  assert.equal(failed.ownedDownloadRuntimeRemoved, true); assert.equal(failed.browserConversionsPerformed, 0);
  let source = (await read("scripts/collect-aiff-id3-build.mjs")).toString();
  source = source.replace('import { aiffId3ToolSizeLimit } from "./lib/aiff-id3-tool-size.mjs";\n', "")
    .replace('const publishedWasm = await readFile(path.join(root, "public/engines/remux/within-aiff.wasm"));\nconst publishedToolSizeReference = { bytes: publishedWasm.length, sha256: sha(publishedWasm), maximumMetadataModuleGrowthBytes: 1024 ** 2 };\n', "")
    .replace('    const limit = aiffId3ToolSizeLimit(file, publishedWasm.length);\n    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit,\n      `${file}: ${info.size} bytes; regular nonempty tool-file limit ${limit}`);',
      '    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size < 8 * 1024 ** 2);')
    .replace("run, artifact, manifest, files, publishedToolSizeReference, reusableToolDirectory", "run, artifact, manifest, files, reusableToolDirectory");
  assert.equal(sha(source), failed.collectorSourceSha256);
});
test("Actual first browser gate passed existing AAC art/audio then exposed an exact native fixture error; owned data gone", async () => {
  const bytes = await read("evidence/2026-10-09T22-34-37-518Z-aiff-id3-browser.json"), browser = JSON.parse(bytes);
  assert.equal(browser.status, "failed-or-incomplete"); assert.match(browser.failure, /0 !== 1/);
  assert.equal(browser.cases.length, 2);
  const passed = browser.cases[0]; assert.equal(passed.status, "passed-small-browser-tag-artwork-full-pcm-and-clock-check");
  assert.equal(passed.audio.source.pcmSha256, passed.audio.output.pcmSha256);
  assert.deepEqual(passed.audio.source.rows, passed.audio.output.rows);
  assert.equal(passed.artworkSha256, "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0");
  const control = JSON.parse(await read("evidence/aiff-unicode-fixture-control-2026-10-10.json"));
  assert.equal(control.records[0].sourceSha256, browser.cases[1].sourceSha256);
  assert.deepEqual(control.records.map(row => row.attachedPictures), [0, 0, 1]);
  assert.equal(control.ownedRuntimeRemoved, true); assert.equal(control.browserConversionsPerformed, 0);
  assert.equal(browser.assetsRestored, true); assert.equal(browser.ownedRuntimeRemoved, true);
  assert.deepEqual(browser.forbiddenRequests, []); assert.equal(browser.publicAcceptance, false);
  for (const row of browser.identities) assert.equal(row.absence.status, "owned-identity-absent");
  await assert.rejects(access(browser.ownedRuntime), { code: "ENOENT" });
});
