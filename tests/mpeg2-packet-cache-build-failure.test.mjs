import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makePacketCacheRecipe } from "../media/ffmpeg/mpeg2-packet-cache-recipe.mjs";
import { makePacketCacheRecipeStrict } from "../media/ffmpeg/mpeg2-packet-cache-strict-recipe.mjs";
import { makeAlignment16Builder, makePacketCacheOuterBuilder, makePacketCacheHevcWrapper } from "../media/ffmpeg/mpeg2-packet-cache-strict-builder-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("failed actual head/log and22 exact source preimages retained before any correction; cleanup succeeds, no conversion", async () => {
  const proof = JSON.parse(await read("evidence/packet-cache-build-failure-38205014374.json"));
  assert.equal(proof.run.headSha, "567c6dea9016e7fb7f79f62678a036e58d89aa78"); assert.equal(proof.run.conclusion, "failure");
  const zipped = await read(proof.archive.path); assert.equal(sha(zipped), proof.archive.sha256);
  const restored = gunzipSync(zipped, { maxOutputLength: 4194304 }); assert.equal(sha(restored), proof.archive.restoredSha256);
  const payload = JSON.parse(restored); assert.equal(sha(payload.failedLog), proof.failedLogSha256);
  assert.match(payload.failedLog, /emcc: error: MAXIMUM_MEMORY is only meaningful with ALLOW_MEMORY_GROWTH.*\[-Werror\]/);
  assert.equal(Object.keys(proof.sourcePins).length, 22);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(Buffer.from(payload.sourcePreimages[file], "base64")), hash); assert.equal(sha(await read(file)), hash);
  }
  assert.equal(proof.hostedCleanupPassed, true); assert.equal(proof.originalRead, false); assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
});
test("only redundant SDK-driver diagnostic remains nonfatal: C warnings-as-errors and explicit fixed32MiB still intact", async () => {
  const base = (await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString(), prior = makePacketCacheRecipe(base), generated = makePacketCacheRecipeStrict(base);
  assert.equal(generated.replace(" -Wno-error=unused-command-line-argument", ""), prior);
  assert.ok(generated.includes("-Wall -Wextra -Werror -Wno-error=unused-command-line-argument"));
  assert.ok(generated.includes("-sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432"));
  assert.ok(!generated.includes("-Wno-error ")); assert.ok(generated.includes("packet-cache-smoke.js"));
});
test("corrected strict nested builders route the real compiler to the precise warning fix and retain valid shell/module syntax", async () => {
  const recipes = [makeAlignment16Builder((await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs")).toString(), root),
    makePacketCacheOuterBuilder((await read("media/ffmpeg/build-mpeg2-alignment16.mjs")).toString(), root),
    makePacketCacheHevcWrapper((await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs")).toString(), root)];
  assert.ok(recipes[0].generated.includes("makePacketCacheRecipeStrict as makeAlignedReuseRecipe"));
  for (const recipe of recipes) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
  }
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-n"], { input: makePacketCacheRecipeStrict((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString()), encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
