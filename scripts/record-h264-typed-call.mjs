import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const candidate = path.join(root, "work/h264-candidate-output");
const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8"));
const report = JSON.parse(await readFile(path.join(root, "output/playwright/h264-candidate.json"), "utf8"));
const failure = report.rows.findLast((row) => row.state?.error?.includes("within-h264.wasm.svc_encode_frame"));
assert.ok(failure, "A named native production-browser failure is required.");
const wasm = await readFile(path.join(candidate, "within-h264.wasm"));
const symbols = await readFile(path.join(candidate, "within-h264.mjs.symbols"), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256(wasm), manifest.artifacts["within-h264.wasm"]);
// This diagnostic is explicitly tied to the pre-fix symbolized build.
assert.equal(manifest.buildRecipeSha256, "54b07474d94a4c0323a577297f86b4b593b6fba99fd43ce7feaa9a0dab94ece1");
const named = new Map(symbols.trim().split(/\r?\n/).map((line) => {
  const separator = line.indexOf(":");
  return [Number(line.slice(0, separator)), line.slice(separator + 1)];
}));
const match = /svc_encode_frame[^\n]*wasm-function\[(\d+)\]:0x([0-9a-f]+)/.exec(failure.state.error);
assert.ok(match);
const functionIndex = Number(match[1]);
const instructionOffset = Number.parseInt(match[2], 16);
assert.equal(named.get(functionIndex), "svc_encode_frame");
assert.equal(wasm[instructionOffset], 0x11, "Expected a real call_indirect instruction.");
let cursor = 8;
const u32 = () => {
  let result = 0, shift = 0, byte;
  do {
    assert.ok(cursor < wasm.length && shift < 35, "Invalid unsigned LEB128.");
    byte = wasm[cursor++];
    result += (byte & 127) * 2 ** shift;
    shift += 7;
  } while (byte & 128);
  return result;
};
const types = [], functions = [];
while (cursor < wasm.length) {
  const section = wasm[cursor++], length = u32(), end = cursor + length;
  assert.ok(end <= wasm.length);
  if (section === 1) {
    const count = u32();
    for (let i = 0; i < count; i++) {
      assert.equal(wasm[cursor++], 0x60);
      const parameters = u32();
      const params = [...wasm.subarray(cursor, cursor + parameters)];
      cursor += parameters;
      const returns = u32();
      const results = [...wasm.subarray(cursor, cursor + returns)];
      cursor += returns;
      types.push({ params, results });
    }
  } else if (section === 3) {
    const count = u32();
    for (let i = 0; i < count; i++) functions.push(u32());
  }
  cursor = end;
}
cursor = instructionOffset + 1;
const callType = u32(), tableIndex = u32();
assert.equal(tableIndex, 0);
const target = [...named].find(([, name]) => name === "WelsEnc::CWelsH264SVCEncoder::ForceIntraFrame(bool, int)");
assert.ok(target);
const importedFunctions = WebAssembly.Module.imports(new WebAssembly.Module(wasm))
  .filter((entry) => entry.kind === "function").length;
const targetType = functions[target[0] - importedFunctions];
assert.deepEqual(types[callType], { params: [0x7f, 0x7f], results: [0x7f] });
assert.deepEqual(types[targetType], { params: [0x7f, 0x7f, 0x7f], results: [0x7f] });
const files = ["media/ffmpeg/openh264-force-intra.cpp", "media/ffmpeg/patches/openh264-force-intra-wasm.patch"];
const evidence = {
  recordedAt: new Date().toISOString(), requirement: "M-04", status: "typed-native-call-diagnosed-fix-awaiting-browser-validation",
  hostedBuild: { runId: 37130206064, commit: "b232557441880a0d845627a76937f52edba9b67e", result: "passed", cleanup: "passed" },
  asBuiltManifest: manifest, artifactBytes: wasm.length, symbolMapSha256: sha256(Buffer.from(symbols)),
  browser: { name: "Chrome", version: "154.0.8037.93", productionBuild: true, productionSecurityHeaders: true,
    tests: 1, passed: 0, failed: 1, acceptedH264Conversions: 0, latestFailure: failure.state },
  diagnosis: { functionIndex, functionName: named.get(functionIndex), instructionOffset: `0x${instructionOffset.toString(16)}`,
    instruction: "call_indirect", callerTypeIndex: callType, callerSignature: "i32 (i32, i32)",
    virtualTargetIndex: target[0], virtualTargetName: target[1], virtualTargetTypeIndex: targetType,
    virtualTargetSignature: "i32 (i32, i32, i32)",
    rootCause: "OpenH264 2.6.0 C vtable omits ForceIntraFrame layer parameter. FFmpeg passes self and IDR only, but the C++ virtual target requires self, IDR and layer. Wasm rejects the indirect call on the source I frame.",
    fix: "Patch only FFmpeg's ForceIntraFrame call to a typed extern-C C++ bridge; call the actual virtual method with explicit layer -1. Keep source keyframe forcing and no global cast emulation.",
  },
  proposedFixSources: Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(path.join(root, file)))]))),
  diagnosticMemory: { primaryIncrementalPrivateMiB: null, certification: "not-evaluated",
    samples: report.rows.findLast((row) => row.samples)?.samples ?? null,
    reason: "Failed small diagnostic fixture and non-stabilized blank baseline, not acceptance evidence" },
  sources: ["https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/libopenh264enc.c",
    "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/api/wels/codec_api.h",
    "https://emscripten.org/docs/porting/guidelines/function_pointer_issues.html"],
  publicProfilesChanged: false, publicEnginesChanged: false, protectedTestMkvUsed: false,
  cleanup: { status: "pending-local-and-remote-disposable-cleanup", distAssetsRestored: true },
};
const output = path.join(root, "evidence/h264-typed-call-diagnosis-2026-10-03.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);
