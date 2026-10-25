import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("artwork fixture generator owns unique scratch, hides/time-bounds every native child and never sweeps a preexisting work directory", async () => {
  const source = await readFile(new URL("../scripts/generate-audio-artwork-fixture.mjs", import.meta.url), "utf8");
  assert.match(source, /createOwnedRuntimeScratch\("audio-artwork-fixture-"\)/);
  assert.match(source, /const workRoot = runtime.directory/);
  assert.match(source, /env: runtime.env, windowsHide: true, timeout: 30000/);
  assert.match(source, /finally \{\s*await runtime.close\(\)/);
  assert.doesNotMatch(source, /await rm\(/);
  assert.match(source, /--fixture-dir/); assert.match(source, /Custom fixtures must stay in repository work/);
  assert.match(source, /Fixture destination must be empty/); assert.match(source, /!info.isSymbolicLink\(\)/);
  assert.match(source, /await realpath\(fixtureRoot\), fixtureRoot/);
  for (const name of ["audio-source-artwork.m4a", "audio-source-mp3-artwork.mp4", "audio-source-vorbis-artwork.ogg", "audio-source-opus-artwork.opus"])
    assert.ok(source.includes(name), "Reusable fixture contract remains unchanged: " + name);
});
test("actual source-pinned generator check created four bounded inputs, rejected overwrite and removed all owned data without claiming browser artwork acceptance", async () => {
  const root = new URL("../", import.meta.url);
  const report = JSON.parse(await readFile(new URL("evidence/2026-10-25T02-44-47.088Z-audio-artwork-fixture-lifecycle.json", root)));
  assert.equal(report.status, "passed-fixture-generation-and-safe-lifecycle-not-browser-artwork-acceptance");
  assert.equal(report.browserConversions, 0); assert.equal(report.nativeBrowserOutputConversionUsed, false);
  assert.equal(report.artworkAcceptance, false); assert.equal(report.publicAcceptance, false); assert.equal(report.fixtures.length, 4);
  for (const row of report.fixtures) { assert.ok(row.bytes > 0 && row.bytes <= 1048576); assert.match(row.sha256, /^[a-f0-9]{64}$/); }
  assert.equal(new Set(report.fixtures.map(f => f.imageSha256)).size, 1);
  assert.equal(report.nonemptyDestinationRejectedBeforeOverwrite, true); assert.equal(report.fixtureHashesUnchangedAfterRejectedCall, true);
  assert.equal(report.ownedGeneratedInputsAndCopiesRemoved, true);
  for (const [file, hash] of Object.entries(report.sources)) assert.equal(createHash("sha256").update(await readFile(new URL(file, root))).digest("hex"), hash);
});
