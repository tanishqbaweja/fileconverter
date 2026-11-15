import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertMkvStartupCore, readStartupComplexReference, startupComplexReference, startupSmallRegressions,
  readStartupSmallRegressions, protectedCompleteVideoReference, readStartupProtectedReference } from "../scripts/lib/mkv-startup-core-reference.mjs";
import { complexMkvFixture } from "../scripts/lib/mkv-complex-fidelity.mjs";
import { protectedRepeatReference, assertSameMkvNativeBuild } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
test("Changed-core regression binds to the exact compiled startup candidate, never the older probe or changed heap", async () => {
  const receipt = JSON.parse(await read("evidence/2026-11-14T23-48-39-600Z-mkv-startup-dts-bframes.json"));
  assertMkvStartupCore(receipt.candidateBuild);
  for (const alter of [
    t => { t.head = "0".repeat(40); }, t => { t.build.wasmMemory[0].maximumPages++; },
    t => { t.build.source.knownPacketClocksRewritten = true; }, t => { t.build.source.hevcTimingPolicyUnchanged = false; },
    t => { t.build.source.startupMaximumPayloadBytes++; }, t => { t.build.source.library.enabledDecoders.push("hevc"); },
  ]) { const changed = structuredClone(receipt.candidateBuild); alter(changed); assert.throws(() => assertMkvStartupCore(changed)); }
  const older = JSON.parse(await read(startupComplexReference.file));
  assert.throws(() => assertMkvStartupCore(older.candidateBuild));
});
test("Original-file gate requires actual current-core HEVC/no-B browser regressions and prior COMPLETE output content proof", async () => {
  const r = JSON.parse(await read("evidence/2026-11-14T23-48-39-600Z-mkv-startup-dts-bframes.json")), tools = r.candidateBuild;
  const small = await Promise.all(startupSmallRegressions.map(ref => read(ref.file)));
  const regressions = readStartupSmallRegressions(small, tools);
  assert.deepEqual(regressions.map(s => s.incrementalPrivateMiB), [157.2265625, 199.0625]);
  assert.ok(regressions.every(s => s.exactCurrentNativeBuildVerified));
  assert.throws(() => readStartupSmallRegressions(small.slice(1), tools));
  assert.throws(() => readStartupSmallRegressions(small.toReversed(), tools));
  const packet = await read(protectedRepeatReference.file), video = await read(protectedCompleteVideoReference.file);
  const ref = readStartupProtectedReference(packet, video, tools);
  assert.equal(ref.outputBytes, 2962151594);
  assert.equal(ref.outputSha256, "247c77c371340f8bfb090dc8f8cfde22d83ca1e83483672847013527c50d937b");
  assert.equal(ref.independentlyDecodedVideoFrames, 296160);
  assert.equal(ref.nativeCoreEqualityClaimed, false); assert.equal(ref.fullVideoDecodePerformedThisRun, false);
  assert.throws(() => readStartupProtectedReference(Buffer.concat([packet, Buffer.from(" ")]), video, tools));
  assert.throws(() => readStartupProtectedReference(packet, Buffer.concat([video, Buffer.from(" ")]), tools));
  assert.throws(() => assertSameMkvNativeBuild(JSON.parse(packet).candidateBuild, tools), "Old native-equality gate remains strict");
});
test("No-B-frame comparison requires identical pinned source and complete previously independently validated output", async () => {
  const bytes = await read(startupComplexReference.file), ref = readStartupComplexReference(bytes, complexMkvFixture);
  assert.equal(ref.outputBytes, 782689);
  assert.equal(ref.outputSha256, "cb62dd3f503c942cffd8ffc2547c29a68e6010a3338f45da24d76f9da395847b");
  assert.equal(ref.nativeCoreEqualityClaimed, false);
  assert.throws(() => readStartupComplexReference(Buffer.concat([bytes, Buffer.from(" ")]), complexMkvFixture));
  assert.throws(() => readStartupComplexReference(bytes, { ...complexMkvFixture, sha256: "0".repeat(64) }));
});
