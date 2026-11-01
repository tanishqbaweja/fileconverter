// Recipe constraints, not compiled-code or browser acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
test("WebCodecs private candidate keeps the exact production native I/O and mux wrapper", async () => {
  assert.equal(createHash("sha256").update(await read("media/ffmpeg/within_remux.c")).digest("hex"),
    "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068");
  const source = await read("media/ffmpeg/within_webcodecs_vp9.c");
  for (const name of ["within_wc_open", "within_wc_frame"]) assert.match(source, new RegExp("EM_ASYNC_JS\\(int, " + name));
  assert.match(source, /within_split_describe_frame\(frame, &layout, emscripten_get_heap_size\(\)\)/);
  assert.match(source, /s->crf != -1/); assert.match(source, /packet->pts = packet->dts = frame->pts/);
  assert.doesNotMatch(source, /fopen|MEMFS|emscripten_wget|pthread_create/);
});
test("WebCodecs private source build pins versions, fixed nonshared heap, JSPI and finally cleanup", async () => {
  const recipe = await read("media/ffmpeg/build-webcodecs-vp9.sh");
  for (const text of ["ffmpeg-8.1.2.tar.xz", "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c",
    "6.0.4", "--enable-encoder=within_webcodecs_vp9", "--disable-pthreads", "-sJSPI=1", "-sALLOW_MEMORY_GROWTH=0",
    "-sINITIAL_MEMORY=33554432", "-sMAXIMUM_MEMORY=33554432", "-sFILESYSTEM=0", "trap cleanup EXIT", "available_kib >= 8388608"])
    assert.ok(recipe.includes(text), text);
  assert.doesNotMatch(recipe, /-pthread\b|ASYNCIFY|--enable-libvpx|\/public\//);
  const workflow = await read(".github/workflows/webcodecs-vp9-nondocker.yml");
  assert.ok(workflow.includes("224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f"));
  assert.ok(workflow.includes("retention-days: 1")); assert.ok(workflow.includes("if: always()"));
  assert.doesNotMatch(workflow, /docker (?:run|build)|actions\/(?:checkout|setup-node|upload-artifact)@v\d/);
  const verifier = await read("scripts/verify-webcodecs-vp9-native.mjs");
  const registration = await read("media/ffmpeg/register-webcodecs-vp9.mjs");
  assert.ok(registration.includes('"type":"commonjs"'), "Disposable configure probes must not inherit app ES-module semantics");
  for (const text of ["nodeInstantiated: false", "browserConversionVerified: false", "fallbackIntegrated: false", "speedGainProven: false",
    "completeChromiumMemoryMeasured: false", "reproducibilityVerified: false", "publicAcceptance: false"])
    assert.ok(verifier.includes(text), text);
});
test("private WebCodecs bridge and artifact are not selected by public worker or capability registry", async () => {
  for (const file of ["workers/media-remux.ts", "lib/capability-registry.ts"])
    assert.doesNotMatch(await read(file), /webcodecs-vp9-bridge|within-webcodecs-vp9/);
});
