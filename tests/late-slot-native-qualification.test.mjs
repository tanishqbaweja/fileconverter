import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, "..");
const json = async file => JSON.parse(await readFile(path.join(root, file)));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("actual hosted diagnostic compiles 82 requests and preserves encoder/fixed heaps, not browser acceptance", async () => {
  const proof = await json("evidence/mpeg2-late-slot-build-2026-10-08.json");
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.run.databaseId, 37739125738);
  assert.equal(proof.run.headSha, "0e26ce4a853364c3cb10546e3313044daa90f927");
  assert.equal(proof.smoke.status, "passed"); assert.equal(proof.smoke.freshRequestsObserved, 82);
  assert.equal(proof.smoke.fixedSlotBytes, 64); assert.equal(proof.smoke.actualRefcountHeaderBytes, 16);
  for (const field of ["afterFirst48Verified", "cacheReuseDoesNotCreateFreshRequest", "initializationAddressBound"])
    assert.equal(proof.smoke[field], true);
  assert.equal(proof.smoke.conversionsPerformed, 0);
  assert.equal(path.dirname(proof.reusableToolDirectory),path.join(root,"work"),"Private native qualifier requires its original repository work");
  const wasm = await readFile(path.join(proof.reusableToolDirectory, "within-mpeg2-split.wasm"));
  assert.deepEqual(readWasmMemoryLimits(wasm), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.ok(WebAssembly.Module.imports(new WebAssembly.Module(wasm)).some(row => row.name === "within_bind_refstruct_abort_slot"));
  assert.equal(proof.manifest.artifacts["split-encoder.wasm"], "8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242");
  assert.equal(proof.manifest.artifacts["split-encoder.mjs"], "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e");
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.actualBrowserAbortCaptureVerified, false);
  assert.equal(proof.originalConversionCompleted, false); assert.equal(proof.actualFailedAllocationBytes, null);
  assert.equal(proof.actualLateFailedPool, null); assert.equal(proof.allocatorRootVerified, false);
});

test("actual tool collection pins source/branch workflow and removes only fresh download, not reusable tools", async () => {
  const proof = await json("evidence/mpeg2-late-slot-build-2026-10-08.json");
  assert.equal(path.dirname(proof.reusableToolDirectory),path.join(root,"work"),"Private native qualifier requires its original repository work");
  assert.equal(proof.files.length, 12); assert.equal(proof.reusableToolBytes, 9615834);
  assert.equal(proof.ownedDownloadRemoved, true); assert.equal(proof.hostedCleanupStepPassed, true);
  await assert.rejects(access(proof.downloadRuntime), { code: "ENOENT" });
  for (const row of proof.files) {
    const bytes = await readFile(path.join(proof.reusableToolDirectory, row.file));
    assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
    if (Object.hasOwn(proof.manifest.artifacts, row.file)) assert.equal(proof.manifest.artifacts[row.file], row.sha256);
  }
  for (const [file, hash] of Object.entries(proof.manifest.artifacts))
    assert.equal(proof.files.find(row => row.file === file)?.sha256, hash);
  const branch = await json("evidence/mpeg2-late-slot-build-branch-2026-10-08.json");
  for (const [file, hash] of Object.entries(proof.manifest.sources))
    assert.equal(file === branch.workflow.path ? branch.workflow.generatedSha256 : sha(await readFile(path.join(root, file))), hash);
  assert.equal(sha(await readFile(path.join(root, "scripts/collect-mpeg2-late-slot-build.mjs"))), proof.collectorSourceSha256);
  assert.equal(proof.protectedOriginalRead, false); assert.equal(proof.localBrowserConversions, 0);
});
