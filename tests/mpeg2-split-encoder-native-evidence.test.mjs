import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const proofUrl = new URL("../evidence/mpeg2-split-encoder-initialized-2026-10-06.json", import.meta.url);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("compiled separate encoder proof is exact to sources/report and preserves actual native initialization scope", async () => {
  const p = JSON.parse(await readFile(proofUrl));
  assert.equal(p.run.id, 37442072537); assert.equal(p.run.jobId, 112197987211);
  assert.equal(p.run.headSha, "026a736a727aae08ba09cbd9f36f20a7a5f7bc2c"); assert.equal(p.run.conclusion, "success");
  assert.equal(p.run.buildSeconds, (Date.parse(p.run.buildCompletedAt) - Date.parse(p.run.buildStartedAt)) / 1000);
  assert.equal(p.run.jobSeconds, (Date.parse(p.run.jobCompletedAt) - Date.parse(p.run.jobStartedAt)) / 1000);
  const text = JSON.stringify(p.native, null, 2) + "\n";
  assert.equal(Buffer.byteLength(text), p.retained.reportBytes); assert.equal(sha(text), p.retained.reportSha256);
  assert.equal(p.retained.reportSha256, "2bc5d26960d2a14ad8b86f4dff3484a2be452a6ae916dc70ffd50a4ab4f3f227");
  assert.equal(Object.keys(p.native.sources).length, 10); assert.equal(Object.keys(p.native.artifacts).length, 5);
  for (const [file, hash] of Object.entries(p.native.sources))
    assert.equal(sha(await readFile(new URL(`../${file}`, import.meta.url))), hash, file);
  assert.deepEqual(p.native.memoryLimits, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
  assert.equal(p.native.stackBytes, 262144); assert.deepEqual(p.native.enabledEncoders, ["MPEG2VIDEO"]);
  assert.deepEqual(p.native.enabledDecoders, []); assert.equal(p.native.settingsCases, 15);
  assert.equal(p.native.rejectedConfigurations.length, 13); assert.equal(p.native.cases.length, 4);
  const configurations = new Set();
  for (const c of p.native.cases) {
    configurations.add(`${c.width}x${c.height}/${c.kind}`);
    assert.equal(c.settingsMatch, true); assert.equal(c.actualNativeParametersMatch, true);
    assert.equal(c.parameterBytes, 192); assert.match(c.parameterSha256, /^[a-f0-9]{64}$/);
    assert.equal(c.prepareCount, 100); assert.equal(c.repeatedInputStorageIdentical, true);
    assert.equal(c.inputReferences, 1); assert.equal(c.framesEncoded, 0); assert.equal(c.packetsProduced, 0);
    assert.equal(c.layout.width, c.width); assert.equal(c.layout.height, c.height);
    assert.equal(c.layout.pixelFormat, c.kind ? "yuv422p" : "yuv420p");
    assert.equal(c.layout.planes.length, 3);
    c.layout.planes.forEach((plane, index) => {
      const rowBytes = index ? c.width / 2 : c.width;
      const rows = !index || c.kind ? c.height : c.height / 2;
      assert.ok(plane.stride >= rowBytes && plane.offset >= plane.allocationOffset);
      assert.ok(plane.offset + (rows - 1) * plane.stride + rowBytes <= plane.allocationOffset + plane.allocationBytes);
      assert.ok(plane.allocationOffset + plane.allocationBytes <= 16777216);
    });
  }
  assert.deepEqual(configurations, new Set(["18x10/0", "18x10/1", "1920x804/0", "1920x804/1"]));
  assert.equal(p.native.finalInputReferences, 0); assert.equal(p.native.closedSlotsZeroed, true);
});
test("initialization proof cannot become a speed, browser conversion, memory or public-route certificate", async () => {
  const p = JSON.parse(await readFile(proofUrl));
  assert.equal(p.run.cleanupConclusion, "success"); assert.equal(p.artifact.deleted, true);
  assert.equal(p.artifact.remainingRunArtifacts, 0); assert.equal(p.retained.unexpectedLocalZip, false);
  assert.equal(p.retained.files, 13); assert.equal(p.retained.bytes, 902729);
  assert.equal(p.localNativeInitialization.openPrepareAbortClosePassed, true);
  assert.equal(p.localNativeInitialization.width, 1920); assert.equal(p.localNativeInitialization.height, 804);
  assert.equal(p.localNativeInitialization.framesEncoded, 0); assert.equal(p.localNativeInitialization.packetsProduced, 0);
  for (const key of ["genuineBrowserConversion", "fidelityVerified", "originalRead", "mediaRead", "mediaWritten",
    "completeChromiumMemoryMeasured", "speedImprovementProven", "publicAcceptance", "fullGoalComplete"])
    assert.equal(p.limits[key], false, key);
  assert.equal(p.limits.conversionSeconds, null); assert.equal(p.native.conversionSeconds, null);
  assert.equal(p.native.framesEncoded, 0); assert.equal(p.native.packetsProduced, 0);
  assert.equal(p.native.completeChromiumMemoryMeasured, false); assert.equal(p.native.publicAcceptance, false);
});
