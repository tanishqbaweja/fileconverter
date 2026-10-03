import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(await readFile(new URL("../evidence/h264-speed-source-review-2026-10-04.json", import.meta.url), "utf8"));
test("low-complexity no-op is recorded without claiming a measured speed gain", () => {
  assert.equal(evidence.rejectedCandidate.nativeRebuilds, 0);
  assert.equal(evidence.rejectedCandidate.browserConversions, 0);
  assert.equal(evidence.rejectedCandidate.speedGainClaim, null);
  assert.equal(evidence.nextCandidate.runtimeVerified, false);
  assert.equal(evidence.nextCandidate.speedGainClaim, null);
  assert.equal(evidence.publicProfilesChanged, false);
  assert.equal(evidence.upstreamSources.length, 3);
  assert.ok(evidence.upstreamSources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
});
test("opt-in whole-library LTO preserves source and memory/quality constraints", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) {
    const bytes = await readFile(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, file);
  }
  const manifest = await readFile(new URL("../media/ffmpeg/h264-candidate-manifest.mjs", import.meta.url), "utf8");
  assert.match(manifest, /libraryLinkTimeOptimization: libraryLto === "1"/);
  assert.match(manifest, /Private H264 library LTO must be 0 or 1/);
});
