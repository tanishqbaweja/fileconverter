import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readPinnedBoxBlurPreimage, patchPinnedBlurBoundary, blurBoundaryPatch } from "../images/resvg-source/blur-boundary-patch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";

test("private blur correction preserves every original kernel/rounding byte and changes only extent handling", async () => {
  const original=await readPinnedBoxBlurPreimage(),entry=await readFile("images/resvg-source/blur-boundary-entry.rs");
  const result=patchPinnedBlurBoundary(original,entry),mark="\n#[inline(never)]";
  assert.equal(sha(result.bytes),blurBoundaryPatch.patchedSha256);
  assert.ok(result.bytes.toString().endsWith(original.toString().slice(original.toString().indexOf(mark))));
  assert.ok(result.bytes.toString().startsWith("// This Source Code Form is subject to the terms of the Mozilla Public"));
  assert.equal(result.proof.entireOriginalSourceRestoredByRemovingOnlyPatch,true);
  assert.equal(result.proof.allKernelAndRoundingFunctionsRetained,true);assert.equal(result.proof.kernelWeightsRoundingOrPassCountChanged,false);
  assert.equal(result.proof.maximumWasmBytesUnchanged,100663296);assert.equal(result.proof.additionalExpandedTemporaryBuffers,2);
  assert.equal(result.proof.nativeSourceRecipeIntegrated,false);assert.equal(result.proof.browserFidelityProven,false);assert.equal(result.proof.publicPromotion,false);
  assert.match(result.bytes.toString(),/pixels <= 96 \* 1024 \* 1024 \/ \(2 \* std::mem::size_of::<RGBA8>\(\)\)/);
  assert.match(result.bytes.toString(),/checked_mul/);assert.match(result.bytes.toString(),/checked_add/);
  const changed=Buffer.from(original);changed[0]^=1;assert.throws(()=>patchPinnedBlurBoundary(changed,entry));
  assert.throws(()=>patchPinnedBlurBoundary(original,Buffer.concat([entry,Buffer.from("\n")])));
});

test("actual compiled numeric negative control and domain-corrected candidate are pinned, not a browser or native-release claim", async () => {
  const bytes=await readFile("evidence/2026-10-29T20-32-05-861Z-svg-blur-boundary-kernel.json"),row=JSON.parse(bytes);
  assert.equal(row.status,"four-compiled-numeric-boundary-tests-pass-not-browser-acceptance");assert.deepEqual(row.failures,[]);
  assert.equal(row.commands.length,3);assert.ok(row.commands.every(c=>c.exitCode===0&&c.signal===null));
  assert.match(row.compilerVersion,/rustc 1\.75\.0/);assert.doesNotMatch(row.compilerVersion,/nightly-2023-12-11/);
  assert.match(row.commands[2].log,/4 passed; 0 failed; 0 ignored/);
  assert.match(row.commands[2].log,/old=79 expanded=136 max=57 center=255/);
  assert.match(row.commands[2].log,/expanded-temporary-bytes=6473376 wasm-cap=100663296/);
  assert.equal(row.patch.patchedSha256,blurBoundaryPatch.patchedSha256);
  assert.equal(row.patch.entrySha256,sha(await readFile("images/resvg-source/blur-boundary-entry.rs")));
  assert.equal(row.sourcePins["images/resvg-source/blur-boundary-kernel-tests.rs"],sha(await readFile("images/resvg-source/blur-boundary-kernel-tests.rs")));
  assert.equal(row.ownedRuntimeRemoved,true);assert.equal(row.nativeSourceRecipeIntegrated,false);
  assert.equal(row.productionConversionTested,false);assert.equal(row.publicPromotion,false);assert.equal(row.wholeGoalComplete,false);
  for(const command of row.commands)assert.ok(["owned-identity-absent","launch-exit-observed-before-birth-query-no-process-killed"].includes(command.cleanup.status));
});

test("numeric probe never opens user fixtures, performs native image conversion or grows the public Wasm cap", async () => {
  const source=await readFile("scripts/test-svg-blur-boundary-kernel.mjs","utf8");
  assert.match(source,/windowsHide: true/);assert.match(source,/await runtime\?\.close\(\)/);
  assert.match(source,/queryReliableProcessIdentity/);assert.match(source,/child.exitCode !== null/);
  assert.doesNotMatch(source,/test\.mkv|ffmpeg|ffprobe|docker|cargo install|rustup install|public\/engines/);
  const tests=await readFile("images/resvg-source/blur-boundary-kernel-tests.rs","utf8");
  assert.equal((tests.match(/#\[test\]/g)??[]).length,4);assert.match(tests,/original_on_extended_domain/);
  assert.match(tests,/5000,5000/);assert.match(tests,/809172/);assert.doesNotMatch(tests,/\.svg|\.png|File::/);
});
