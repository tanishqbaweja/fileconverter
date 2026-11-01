// Static compiled-tool checks only. No Node/native media conversion, not browser acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
const root = new URL("../", import.meta.url), output = new URL("work/webcodecs-vp9-output/", root);
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), artifacts = {}, sources = {};
for (const file of ["within-webcodecs-vp9.mjs", "within-webcodecs-vp9.wasm", "config_components.h", "config.mak", "LICENSE.LGPLv2.1", "registration.json"]) {
  const bytes = await readFile(new URL(file, output)); artifacts[file] = { bytes: bytes.length, sha256: sha(bytes) };
}
for (const file of ["media/ffmpeg/within_remux.c", "media/ffmpeg/within_webcodecs_vp9.c", "media/ffmpeg/mpeg2-split-frame-layout.h",
  "media/ffmpeg/build-webcodecs-vp9.sh", "media/ffmpeg/register-webcodecs-vp9.mjs", "workers/webcodecs-vp9-bridge.mjs",
  "scripts/verify-webcodecs-vp9-native.mjs", "scripts/lib/wasm-memory-limits.mjs", ".github/workflows/webcodecs-vp9-nondocker.yml"])
  sources[file] = sha(await readFile(new URL(file, root)));
assert.equal(sources["media/ffmpeg/within_remux.c"], "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
const wasm = await readFile(new URL("within-webcodecs-vp9.wasm", output)); assert.ok(wasm.length < 8 * 1024 ** 2);
assert.ok(WebAssembly.validate(wasm));
const memoryLimits = readWasmMemoryLimits(wasm);
assert.deepEqual(memoryLimits, [{ imported: false, initialPages: 512, maximumPages: 512, shared: false }]);
const compiledModule = new WebAssembly.Module(wasm), exports = WebAssembly.Module.exports(compiledModule);
assert.ok(exports.some(row => row.name === "within_remux"));
assert.deepEqual(exports.filter(row => /asyncify_(start|stop)_(unwind|rewind)/.test(row.name)), []);
const glue = await readFile(new URL("within-webcodecs-vp9.mjs", output), "utf8");
assert.ok(glue.includes("WebAssembly.Suspending") && glue.includes("WebAssembly.promising"));
assert.ok(glue.includes("withinWebCodecs") && glue.includes("withinBridge"));
const components = await readFile(new URL("config_components.h", output), "utf8");
const enabled = category => [...components.matchAll(new RegExp("^#define CONFIG_(\\w+)_" + category + " 1$", "gm"))].map(x => x[1]);
assert.deepEqual(enabled("ENCODER"), ["WITHIN_WEBCODECS_VP9"]);
assert.ok(enabled("DECODER").includes("THEORA") && enabled("DECODER").includes("H264"));
assert.deepEqual(enabled("MUXER"), ["WEBM"]);
const report = { scope: "private-compiled-native-tool-static-contract-only", sources, artifacts,
  ffmpeg: { version: "8.1.2", releaseSha256: "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c" },
  emscripten: "6.0.4", emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f", memoryLimits,
  stackBytesDeclared: 262144, nativeThreads: 1, workerPool: 0, enabledEncoders: enabled("ENCODER"),
  enabledDecoders: enabled("DECODER"), enabledDemuxers: enabled("DEMUXER"), enabledMuxers: enabled("MUXER"),
  enabledParsers: enabled("PARSER"), enabledBitstreamFilters: enabled("BSF"),
  nodeInstantiated: false, framesEncoded: 0, mediaRead: false, mediaWritten: false, browserConversionVerified: false,
  hardwareSelectionProven: false, fallbackIntegrated: false, speedGainProven: false,
  completeChromiumMemoryMeasured: false, reproducibilityVerified: false, publicAcceptance: false };
await writeFile(new URL("native-contract.json", output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report));
