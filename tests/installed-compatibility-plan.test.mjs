import assert from "node:assert/strict";
import test from "node:test";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicProfilesFor } from "../lib/capability-registry.ts";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { INSTALLED_COMPATIBILITY_CASES as cases, INSTALLED_COMPATIBILITY_LIMITS as limits, installedCompatibilityPaths,
  isCompatibilityStaticPath, makeCompatibilityWave, validateCompatibilityMetrics } from "../scripts/lib/installed-compatibility-plan.mjs";
import { validateInstalledCompatibilityOutput } from "../scripts/lib/installed-compatibility-validators.mjs";

test("eight real public families with finite fixtures, original MKV is never copied or substituted", async () => {
  assert.equal(cases.length, 8); assert.equal(new Set(cases.map(c => c.family)).size, 8);
  for (const c of cases) {
    assert.ok(publicProfilesFor(c.extension).some(p => p.id === c.profileId), c.profileId);
    if (c.fixture) {
      assert.match(c.fixture, /^fixtures\/[a-z]+\/[a-zA-Z0-9.-]+$/); assert.doesNotMatch(c.fixture, /test\.mkv$/);
      const info = await stat(new URL("../" + c.fixture, import.meta.url)); assert.ok(info.size > 0 && info.size <= limits.inputBytes);
    } else assert.equal(c.profileId, "wav-to-flac");
  }
});
test("installed pin plans identify actual versioned Opera executable/DLL, not a guessed chrome.dll", () => {
  const opera = installedCompatibilityPaths("opera-gx", "138.0.6044.65");
  assert.notEqual(opera.launcher, opera.executable); assert.match(opera.executable, /\\138\.0\.6044\.65\\opera\.exe$/);
  assert.match(opera.library, /\\138\.0\.6044\.65\\opera_browser\.dll$/);
  const brave = installedCompatibilityPaths("brave", "157.1.99.55");
  assert.equal(brave.launcher, brave.executable); assert.match(brave.library, /\\157\.1\.99\.55\\chrome\.dll$/);
  for (const [id, version] of [["chrome", "1.0.0.0"], ["brave", "../../outside"], ["opera-gx", "a.b.c.d"]])
    assert.throws(() => installedCompatibilityPaths(id, version));
});
test("deterministic generated WAV is real bounded 2s mono PCM, never a renamed fixture", () => {
  const b = makeCompatibilityWave(); assert.deepEqual(b, makeCompatibilityWave()); assert.equal(b.length, 176444);
  assert.equal(b.toString("ascii", 0, 4), "RIFF"); assert.equal(b.readUInt32LE(4), b.length - 8);
  assert.equal(b.toString("ascii", 8, 16), "WAVEfmt "); assert.equal(b.readUInt16LE(20), 1);
  assert.equal(b.readUInt16LE(22), 1); assert.equal(b.readUInt32LE(24), 44100); assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.readUInt32LE(40), 176400); assert.notEqual(b.readInt16LE(44), b.readInt16LE(46));
});
test("exact build paths and fixed navigation queries reject same-origin filename/query payloads", () => {
  const origin = "http://127.0.0.1:31337", assets = new Set(["/assets/worker-a.mjs", "/engines/remux/fixed.wasm"]);
  for (const p of ["/", "/?test=1", "/?test=1&directory=1", "/?test=1&fault=write", ...assets]) assert.equal(isCompatibilityStaticPath(origin + p, origin, assets), true);
  for (const p of ["/upload", "/?test=1&filename=secret", "/assets/worker-a.mjs?name=secret", "/assets/worker-a.mjs#secret", "/assets/user-secret.wasm"])
    assert.equal(isCompatibilityStaticPath(origin + p, origin, assets), false);
  assert.equal(isCompatibilityStaticPath("https://example.invalid/assets/worker-a.mjs", origin, assets), false);
});
test("finite output, one pending and unchanged read/write/queue and private-memory limits", () => {
  const good = { outputBytes: 1, maxReadChunkBytes: limits.readChunkBytes, maxWriteChunkBytes: limits.writeChunkBytes,
    peakQueuedBytes: limits.queuedBytes, peakPendingOperations: 1, queuedBytes: 0, pendingOperations: 0 };
  validateCompatibilityMetrics(good);
  for (const key of Object.keys(good)) assert.throws(() => validateCompatibilityMetrics({ ...good, [key]: 8388609 }), key);
  assert.equal(limits.primaryMiB, 250); assert.equal(limits.cleanupMiB, 96);
});
test("independent text oracles reject wrong timestamp, dropped Unicode and oversized validator files", async () => {
  const scratch = await createOwnedRuntimeScratch("compat-validator-unit-");
  try {
    const file = path.join(scratch.directory, "test-output"), unavailable = () => assert.fail("No native media conversion or validator needed");
    const vtt = "WEBVTT\r\n\r\n00:00:01.250 --> 00:00:03.900\r\n<i>Hello</i> from Within.\r\n\r\n00:00:04.100 --> 00:00:07.000\r\nSecond cue\r\nwith two lines.\r\n";
    await writeFile(file, vtt, { flag: "wx" }); assert.equal((await validateInstalledCompatibilityOutput("srt-to-vtt", null, file, unavailable)).cues, 2);
    await writeFile(file, vtt.replace("07.000", "07.010")); await assert.rejects(validateInstalledCompatibilityOutput("srt-to-vtt", null, file, unavailable));
    await writeFile(file, "name\tnote\tcount\r\nalpha\t\"comma, quote \"\"and\"\" newline\ninside\"\t2\r\nbeta\tUnicode survives\t3\r\n");
    await assert.rejects(validateInstalledCompatibilityOutput("csv-to-tsv", null, file, unavailable));
    await writeFile(file, Buffer.alloc(12289)); await assert.rejects(validateInstalledCompatibilityOutput("epub-to-txt", null, file, unavailable));
  } finally { await scratch.close(); }
});
