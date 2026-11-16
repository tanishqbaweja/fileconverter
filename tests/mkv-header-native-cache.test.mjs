import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { headerNativeCodeCache, loadQualifiedHeaderNativeCache, retainQualifiedHeaderNativeCache } from "../scripts/lib/mkv-header-native-cache.mjs";
import { hevcHeaderLoopReference } from "../scripts/lib/mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = f => readFile(path.join(root, f)), sha = b => createHash("sha256").update(b).digest("hex");
async function mockRoot() {
  const runtime = await createOwnedRuntimeScratch("mkv-native-cache-negative-");
  await mkdir(path.join(runtime.directory, "evidence"));
  await copyFile(path.join(root, hevcHeaderLoopReference.file), path.join(runtime.directory, hevcHeaderLoopReference.file)); return runtime;
}
test("actual explicitly reusable code cache authenticates full factory/Wasm/license bytes and actual ABI/memory without claiming remote availability, fresh build or public release", async () => {
  const tools = await loadQualifiedHeaderNativeCache(root), gold = JSON.parse(await read(hevcHeaderLoopReference.file)).candidateBuild;
  assertSameMkvNativeBuild(gold, tools.proof); assert.equal(tools.assets.size, 2); assert.equal(headerNativeCodeCache.length, 3);
  assert.equal(tools.proof.artifact.kind, "explicit-reusable-qualification-native-code-cache");
  assert.equal(tools.delivery.remoteAvailabilityClaimed, false); assert.equal(tools.delivery.freshBuildClaimed, false); assert.equal(tools.delivery.publicAcceptance, false);
  assert.equal(sha(tools.assets.get("/engines/remux/within-direct.wasm").body), "41c4a075de285d0d906b2711c5e5420a401235ab89e1f185abe5d48a830a3eba");
  assert.equal(sha(await read("fixtures/qualification-tools/LICENSE.ffmpeg-lgpl3")), "da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768");
});
test("same-size corrupted cached code fails whole-file authentication before missing later entries could be accepted", async () => {
  const runtime = await mockRoot();
  try {
    await mkdir(path.join(runtime.directory, "fixtures/qualification-tools"), { recursive: true });
    const bytes = Buffer.from(await read(headerNativeCodeCache[0].file)); bytes[12] ^= 1;
    await writeFile(path.join(runtime.directory, headerNativeCodeCache[0].file), bytes, { flag: "wx" });
    await assert.rejects(loadQualifiedHeaderNativeCache(runtime.directory), { name: "AssertionError" });
  } finally { await runtime.close(); }
});
test("invalid final license removes only newly created code files in finally, never an existing qualification file", async () => {
  const runtime = await mockRoot(), tools = await loadQualifiedHeaderNativeCache(root);
  try {
    await assert.rejects(retainQualifiedHeaderNativeCache(runtime.directory, tools, Buffer.from("wrong license")));
    for (const entry of headerNativeCodeCache) await assert.rejects(lstat(path.join(runtime.directory, entry.file)), { code: "ENOENT" });
  } finally { await runtime.close(); }
});
test("existing mismatched code is never overwritten; other newly owned files are recovered after verification fails", async () => {
  const runtime = await mockRoot(), tools = await loadQualifiedHeaderNativeCache(root), existing = path.join(runtime.directory, headerNativeCodeCache[0].file);
  try {
    await mkdir(path.dirname(existing), { recursive: true }); await writeFile(existing, "preserve-existing", { flag: "wx" });
    await assert.rejects(retainQualifiedHeaderNativeCache(runtime.directory, tools, await read("fixtures/qualification-tools/LICENSE.ffmpeg-lgpl3")));
    assert.equal((await readFile(existing)).toString(), "preserve-existing");
    for (const entry of headerNativeCodeCache.slice(1)) await assert.rejects(lstat(path.join(runtime.directory, entry.file)), { code: "ENOENT" });
  } finally { await runtime.close(); }
});
test("actual attempt2 rebuild reproduces COMPLETE original native build/ABI; changed ZIP identity is recorded, not mistaken for changed codec bytes", async () => {
  const bytes = await read("evidence/2026-11-16T12-46-18-964Z-mkv-header-native-reproduction.json");
  assert.equal(sha(bytes), "4e0c7304ec079829501e9202946e1d32a1b1c01dc27d1e4149d3766cf1405259");
  const r = JSON.parse(bytes), original = JSON.parse(await read(hevcHeaderLoopReference.file)).candidateBuild;
  assert.equal(r.status, "passed-complete-native-rebuild-byte-reproduction-not-browser-or-public-acceptance"); assertSameMkvNativeBuild(original, r.actualRebuiltNativeProof);
  assert.equal(r.actualRebuiltNativeProof.artifact.id, 14227141288); assert.notEqual(r.actualRebuiltNativeProof.artifact.id, original.artifact.id);
  assert.equal(r.actualRebuiltNativeProof.artifact.digest, "sha256:621562a2f900816b64ad2636e73d919d6d73c012fb0015142c583d323e53ca5d");
  assert.equal(r.disposableDownloadedArchiveRemoved, true); assert.deepEqual(r.failures, []);
  for (const field of ["dockerUsed", "nativeConversionUsed", "publicAcceptance"]) assert.equal(r[field], false);
});
