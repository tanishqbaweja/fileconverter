// Explicit reusable qualification CODE, not media or a public engine promotion.
// This avoids rebuilding identical native code merely because a one-day hosted
// artifact expired. Every byte is still bound to the complete original proof.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { hevcHeaderLoopReference, assertHevcHeaderParserCore, readHevcHeaderLoopReference } from "./mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readEmscriptenExportAbi } from "./wasm-export-abi.mjs";
import { CORRECTED_DIRECT_MKV_CORE } from "../../lib/mkv-corrected-direct-qualification.ts";
export const headerNativeCodeCache = Object.freeze([
  { name: "within-direct.mjs", file: "fixtures/qualification-tools/within-test-mkv-header-core.mjs", type: "text/javascript" },
  { name: "within-direct.wasm", file: "fixtures/qualification-tools/within-test-mkv-header-core.wasm", type: "application/wasm" },
  { name: "LICENSE.ffmpeg-lgpl3", file: "fixtures/qualification-tools/LICENSE.ffmpeg-lgpl3", type: "text/plain" },
]);
const sha = b => createHash("sha256").update(b).digest("hex");
async function golden(root) {
  const bytes = await readFile(path.join(root, hevcHeaderLoopReference.file)); assert.equal(sha(bytes), hevcHeaderLoopReference.sha256);
  const r = JSON.parse(bytes); assertHevcHeaderParserCore(r.candidateBuild); readHevcHeaderLoopReference(bytes, r.candidateBuild); return r.candidateBuild;
}
export async function loadQualifiedHeaderNativeCache(root) {
  const original = await golden(root), assets = new Map(), retained = [];
  for (const entry of headerNativeCodeCache) {
    const file = path.join(root, entry.file), info = await lstat(file), expected = original.build.artifacts[entry.name];
    assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(info.size, expected.bytes); assert.ok(info.size <= 8 * 1048576);
    assert.equal(await realpath(file), file, "Qualification code cache must not redirect outside its exact repository path");
    const body = await readFile(file); assert.equal(body.length, expected.bytes); assert.equal(sha(body), expected.sha256);
    if (entry.type !== "text/plain") assets.set(`/engines/remux/${entry.name}`, { body, type: entry.type });
    retained.push({ file: entry.file, ...expected });
  }
  const wasm = assets.get("/engines/remux/within-direct.wasm").body, nativeModule = assets.get("/engines/remux/within-direct.mjs").body;
  assert.deepEqual(readWasmMemoryLimits(wasm), original.build.wasmMemory);
  const abi = readEmscriptenExportAbi(nativeModule.toString(), wasm); assert.deepEqual(abi, original.abi);
  const delivery = { kind: "explicit-reusable-qualification-native-code-cache", qualificationReference: hevcHeaderLoopReference,
    remoteAvailabilityClaimed: false, freshBuildClaimed: false, publicAcceptance: false, retainedCodeAssets: retained };
  // Do not mislabel this delivery as a newly downloaded or still-available ZIP.
  const proof = { ...original, artifact: delivery, abi }; assertSameMkvNativeBuild(original, proof);
  return { proof, assets, delivery };
}

// Serve only these separately named authenticated resources in the owned
// loopback qualification. Ordinary production /engines/remux URLs remain
// unchanged; this map cannot accidentally substitute them.
export async function loadQualifiedHeaderDirectAssets(root) {
  const { proof, assets, delivery } = await loadQualifiedHeaderNativeCache(root);
  const nativeModule = assets.get("/engines/remux/within-direct.mjs");
  const wasm = assets.get("/engines/remux/within-direct.wasm");
  assert.equal(nativeModule?.type, "text/javascript"); assert.equal(wasm?.type, "application/wasm");
  return { proof, delivery, assets: new Map([[CORRECTED_DIRECT_MKV_CORE.module, nativeModule], [CORRECTED_DIRECT_MKV_CORE.wasm, wasm]]) };
}
export async function retainQualifiedHeaderNativeCache(root, tools, qualificationLicense) {
  const original = await golden(root); assertHevcHeaderParserCore(tools.proof); assertSameMkvNativeBuild(original, tools.proof);
  const directory = path.join(root, "fixtures/qualification-tools"); await mkdir(directory, { recursive: true });
  assert.equal(await realpath(directory), directory); const created = []; let verified = false;
  try {
    for (const entry of headerNativeCodeCache) {
      const body = entry.type === "text/plain" ? qualificationLicense : tools.assets.get(`/engines/remux/${entry.name}`)?.body;
      const expected = original.build.artifacts[entry.name];
      assert.ok(body instanceof Uint8Array); assert.equal(body.byteLength, expected.bytes); assert.equal(sha(body), expected.sha256);
      const file = path.join(root, entry.file); let handle;
      try { handle = await open(file, "wx"); }
      catch (error) { if (error.code !== "EEXIST") throw error; continue; } // existing content is independently checked below, never overwritten
      try { const identity = await handle.stat({ bigint: true }); created.push({ file, identity }); await handle.writeFile(body); }
      finally { await handle.close(); }
    }
    const cached = await loadQualifiedHeaderNativeCache(root); verified = true; return cached.delivery;
  } finally {
    if (!verified) for (const { file, identity } of created) {
      const actual = await lstat(file, { bigint: true });
      for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(actual[key], identity[key]);
      assert.equal(path.dirname(file), directory); await unlink(file); // exact newly owned code files only, no recursive sweep
    }
  }
}
