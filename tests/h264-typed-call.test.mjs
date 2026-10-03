import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root, "evidence/h264-typed-call-diagnosis-2026-10-03.json"), "utf8"));

test("the H264 signature diagnosis is bound to an actual named browser trap and Wasm types", () => {
  assert.equal(evidence.hostedBuild.runId, 37130206064);
  assert.equal(evidence.hostedBuild.result, "passed");
  assert.equal(evidence.browser.failed, 1);
  assert.equal(evidence.browser.acceptedH264Conversions, 0);
  assert.match(evidence.browser.latestFailure.error, /within-h264\.wasm\.svc_encode_frame/);
  assert.equal(evidence.diagnosis.instructionOffset, "0x33a22d");
  assert.equal(evidence.diagnosis.instruction, "call_indirect");
  assert.equal(evidence.diagnosis.callerSignature, "i32 (i32, i32)");
  assert.equal(evidence.diagnosis.virtualTargetSignature, "i32 (i32, i32, i32)");
  assert.equal(evidence.diagnosis.virtualTargetName, "WelsEnc::CWelsH264SVCEncoder::ForceIntraFrame(bool, int)");
  assert.equal(evidence.asBuiltManifest.initialWasmMemoryBytes, 64 * 1024 * 1024);
  assert.equal(evidence.diagnosticMemory.primaryIncrementalPrivateMiB, null);
  assert.equal(evidence.publicProfilesChanged, false);
  assert.equal(evidence.publicEnginesChanged, false);
});

test("the isolated H264 build fixes the typed call without discarding keyframes or enabling cast emulation", async () => {
  for (const [file, expected] of Object.entries(evidence.proposedFixSources)) {
    assert.equal(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"), expected, file);
  }
  const shim = await readFile(path.join(root, "media/ffmpeg/openh264-force-intra.cpp"), "utf8");
  assert.match(shim, /extern "C" int within_openh264_force_intra\(ISVCEncoder \*encoder, bool idr\)/);
  assert.match(shim, /encoder->ForceIntraFrame\(idr, -1\)/);
  const patch = await readFile(path.join(root, "media/ffmpeg/patches/openh264-force-intra-wasm.patch"), "utf8");
  assert.match(patch, /if \(frame->pict_type == AV_PICTURE_TYPE_I\)/);
  assert.match(patch, /\+\s+within_openh264_force_intra\(s->encoder, true\)/);
  const recipe = await readFile(path.join(root, "media/ffmpeg/build-h264-candidate.sh"), "utf8");
  assert.match(recipe, /4c86c9d87fdfb122f2892ca7984a0544877f99f43e4fe49eec9286021cef96eb/);
  assert.match(recipe, /patch --fuzz=0 --directory=ffmpeg --strip=1/);
  assert.match(recipe, /em\+\+ -c "\$\{SCRIPT_DIR\}\/openh264-force-intra\.cpp"/);
  assert.match(recipe, /"\$\{BUILD_ROOT\}\/openh264-force-intra\.o" -lstdc\+\+/);
  assert.match(recipe, /"\$\{SCRIPT_DIR\}\/patches\/openh264-force-intra-wasm\.patch" source-bundle/);
  assert.doesNotMatch(recipe, /-sEMULATE_FUNCTION_POINTER_CASTS/);
});
