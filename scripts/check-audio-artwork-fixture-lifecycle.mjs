// Native generated INPUT fixture lifecycle only, never a browser-output converter.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(process.argv.length, 2);
const runtime = await createOwnedRuntimeScratch("audio-artwork-lifecycle-check-"), directory = path.join(runtime.directory, "fixtures");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "failed", scope: "Four small generated audio/artwork INPUT fixtures, protected output destination and owned scratch cleanup only",
  browserConversions: 0, nativeBrowserOutputConversionUsed: false, artworkAcceptance: false, publicAcceptance: false, sources: {}, fixtures: [] };
for (const file of ["scripts/check-audio-artwork-fixture-lifecycle.mjs", "scripts/generate-audio-artwork-fixture.mjs", "scripts/lib/owned-runtime-scratch.mjs"])
  report.sources[file] = sha(await readFile(path.join(root, file)));
const names = ["audio-source-artwork.m4a", "audio-source-mp3-artwork.mp4", "audio-source-vorbis-artwork.ogg", "audio-source-opus-artwork.opus"];
const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 65536 };
const args = ["scripts/generate-audio-artwork-fixture.mjs", "--fixture-dir", directory];
try {
  await mkdir(directory);
  const started = Date.now(), generated = await execute(process.execPath, args, options); report.generationElapsedMs = Date.now() - started;
  assert.deepEqual(generated.stdout.trim().split(/\r?\n/).map(file => path.basename(file)), names);
  assert.deepEqual((await readdir(directory)).toSorted(), names.flatMap(name => [name, name + ".json"]).toSorted());
  const fingerprints = {};
  for (const name of names) {
    const file = path.join(directory, name), info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 1048576);
    const digest = sha(await readFile(file)), manifest = JSON.parse(await readFile(file + ".json"));
    assert.equal(manifest.bytes, info.size); assert.equal(manifest.sha256, digest);
    assert.equal(manifest.artwork.codec, "png"); assert.equal(manifest.artwork.width, 64); assert.equal(manifest.artwork.height, 64);
    const pictures = manifest.probe.streams.filter(s => s.disposition?.attached_pic === 1); assert.equal(pictures.length, 1);
    assert.equal(pictures[0].codec_name, "png"); assert.equal(pictures[0].width, 64); assert.equal(pictures[0].height, 64);
    for (const entry of [name, name + ".json"]) fingerprints[entry] = sha(await readFile(path.join(directory, entry)));
    report.fixtures.push({ name, bytes: info.size, sha256: digest, imageSha256: manifest.artwork.sha256 });
  }
  await assert.rejects(execute(process.execPath, args, options), error => /Fixture destination must be empty/.test(error.stderr));
  for (const [file, hash] of Object.entries(fingerprints)) assert.equal(sha(await readFile(path.join(directory, file))), hash);
  report.nonemptyDestinationRejectedBeforeOverwrite = true; report.fixtureHashesUnchangedAfterRejectedCall = true;
  report.status = "passed-fixture-generation-and-safe-lifecycle-not-browser-artwork-acceptance";
} catch (error) { report.failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.ownedGeneratedInputsAndCopiesRemoved = true;
  report.finishedAt = new Date().toISOString();
  const destination = path.join(root, "evidence", report.startedAt.replaceAll(":", "-") + "-audio-artwork-fixture-lifecycle.json");
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ receipt: destination, status: report.status, fixtureCount: report.fixtures.length,
    cleanup: report.ownedGeneratedInputsAndCopiesRemoved, failure: report.failure }));
}
