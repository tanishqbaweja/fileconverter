import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("MP3 recovery selects exactly three new real jobs without replaying the metadata matrix or full-scale gate", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  const start = source.indexOf("const selectedCases = "), end = source.indexOf(";\nconst root =", start);
  assert.ok(start > 0 && end > start);
  const expression = source.slice(start + "const selectedCases = ".length, end);
  const cases = JSON.parse(JSON.stringify(runInNewContext("(" + expression + ")",
    { mp3GainMatrix: false, mp3Clipping: false, mp3IoRecovery: true }, { timeout: 1000 })));
  assert.deepEqual(cases, [
    { source: "flac", destination: "mp3", interruption: "cancel", payloadCancellation: true },
    { source: "flac", destination: "mp3", artwork: "png", interruption: "write" },
    { source: "flac", destination: "mp3", artwork: "png", gainRepair: true, recoveryAfterIo: true },
  ]);
  assert.ok(cases.every(row => !row.repeated && !row.highAmplitude));
});
test("MP3 recovery retains genuine audio progress, real production fault path and exact known-control full-PCM/ID3 recovery", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /"--mp3-io-recovery"/);
  assert.match(source, /const mp3GainRepair = [^\n]+\|\| mp3IoRecovery/);
  assert.match(source, /if \(audioIoRecovery \|\| mp3IoRecovery\)/);
  assert.match(source, /duration=180/);
  assert.match(source, /if \(conversion.payloadCancellation\) await page.waitForFunction/);
  assert.match(source, /state.metrics\?\.inputBytes > 262144 && state.metrics\?\.outputBytes > 65536/);
  assert.match(source, /row.beforeCancel.metrics.inputBytes > 262144 && row.beforeCancel.metrics.outputBytes > 65536/);
  assert.match(source, /getByRole\("button", \{ name: "Cancel safely", exact: true \}\).click\(\)/);
  assert.match(source, /audioIoRecovery \|\| vorbisIoRecovery \|\| mp3IoRecovery\) await page.evaluate/);
  assert.match(source, /history.replaceState\(null, "", "\/\?test=1" \+ \(fault \? "&fault=write" : ""\)\)/);
  assert.match(source, /validateAudioInterruption\(conversion.interruption, state/);
  assert.match(source, /row.output.sha256, "fd3c70154c11380dd727bd1e7b94d2a530b16deffa30aab36c012e5abcdae293"/);
  assert.match(source, /assert.equal\(row.id3Metadata.status, "passed"\); assert.ok\(row.repairedGainProof.fullPcmQualityPassed\)/);
  assert.match(source, /row.fidelity.minimumPsnrDb, 60/);
  assert.match(source, /Math.abs\(gain.leastSquaresGain - 1\) <= 0.001/);
  assert.match(source, /bothInterruptionsPassed: true, noContextOrPageRecreation: true, noStaleErrorOrWarning: true/);
  assert.match(source, /automaticNativeQualityCode: 0, clippingAcceptance: false, publicAcceptance: false/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /assert.ok\(report.memory.incrementalPrivateMiB <= 250\)/);
  assert.match(source, /await runtime.close\(\)/);
});
