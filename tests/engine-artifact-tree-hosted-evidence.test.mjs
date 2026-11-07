import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = b => createHash("sha256").update(b).digest("hex");
const hosted = JSON.parse(await read("evidence/2026-11-07-engine-artifact-tree-hosted.json"));
const localRaw = await read(hosted.localReceipt), local = JSON.parse(localRaw);
const step = (r, name) => r.steps.find(s => s.name === name)?.conclusion;
test("actual published inventory covers 95 files/20 Wasm in 12 declared trees without mislabelling identity as rebuild", () => {
  assert.equal(sha(localRaw), hosted.localSha256);
  assert.equal(local.publishedGroups, 12); assert.equal(local.publishedFiles, 95); assert.equal(local.publishedWasmFiles, 20);
  assert.equal(local.publishedBytes, 89814667);
  assert.equal(local.publishedArtifactTrees.reduce((n, r) => n + r.files, 0), 95);
  assert.equal(local.publishedArtifactTrees.filter(r => r.reproductionKind === "native-source").length, 11);
  for (const r of local.publishedArtifactTrees) {
    assert.equal(r.expectedCommit, hosted.checkedOutHead); assert.equal(r.mode, "published");
    assert.equal(r.publishedTreeMatchesCommit, true); assert.equal(r.rebuiltTreeMatchesCommit, false);
    assert.equal(r.sourceCompilationProvenByComparator, false); assert.match(r.treeSha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(local.nativeSourceRebuildExecutedLocally, false); assert.equal(local.protectedTestMkvOpened, false);
});
test("terminal hosted BZIP2 actually compiled from pinned source and compared all four fresh artifacts to the commit", () => {
  const r = hosted.records.find(row => row.engine === "bzip2");
  assert.equal(r.runId, 42378371912); assert.equal(r.jobId, 128420647034);
  assert.equal(r.headSha, "1d74b2dbf0a2b7252393e9f6cbb6a3d26d2ccf1d");
  assert.equal(r.conclusion, "success"); assert.equal(r.nativeSourceRecipeExecuted, true);
  for (const name of ["Install pinned Emscripten SDK without Docker", "Rebuild pinned engine", "Compare fresh native output and published tree to committed blobs",
    "Confirm published tracked artifacts were not changed", "Remove repository-local engine build data", "Complete job"])
    assert.equal(step(r, name), "success");
  assert.match(r.logExtracts.join("\n"), /emsdk install "6\.0\.4"/);
  assert.match(r.logExtracts.join("\n"), /Exact non-Docker BZIP2 artifact comparison passed/);
  assert.equal(r.comparison.rebuiltDirectory, "work/bzip2-nondocker-output"); assert.equal(r.comparison.files, 4);
  assert.equal(r.comparison.bytes, 72150); assert.equal(r.comparison.rebuiltTreeMatchesCommit, true);
  assert.equal(r.comparison.treeSha256, local.publishedArtifactTrees.find(e => e.engine === "bzip2").treeSha256);
  assert.equal(hosted.otherNativeRebuildsNotRun, 10); assert.deepEqual(hosted.nativeSourceRebuildsExecuted, ["bzip2"]);
});
test("terminal hosted SVG only copies the pinned package into disposable scratch; skipped gates remain unrun", () => {
  const r = hosted.records.find(row => row.engine === "svg");
  assert.equal(r.runId, 42378374450); assert.equal(r.jobId, 128420653014); assert.equal(r.conclusion, "success");
  assert.equal(step(r, "Rebuild pinned engine"), "skipped");
  assert.equal(step(r, "Verify isolated pinned SVG package copy (not source compilation)"), "success");
  assert.equal(r.comparison.files, 2); assert.equal(r.comparison.rebuiltTreeMatchesCommit, true);
  assert.equal(r.comparison.sourceCompilationExecuted, false); assert.equal(r.comparison.scratchRemoved, true);
  assert.equal(r.comparison.treeSha256, local.actualSvgPackageCopy.treeSha256);
  for (const run of hosted.records) {
    assert.equal(run.otherJobs.find(j => j.name === "verify").conclusion, "skipped");
    assert.equal(run.otherJobs.find(j => j.name.startsWith("Browser conversions")).conclusion, "skipped");
  }
  assert.equal(hosted.sourceOnlyReleaseGateStillOpen, true); assert.equal(hosted.allPublishedEnginesSourceRebuilt, false);
  assert.equal(hosted.fullGoalComplete, false);
});
