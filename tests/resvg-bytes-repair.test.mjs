import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { makePathfinderLock } from "../images/resvg-source/pathfinder-repair.mjs";
import { bytesRepair, makePublishedBytesLock } from "../images/resvg-source/bytes-repair.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
const proof = await json("evidence/2026-10-27-svg-pathfinder-terminal-and-bytes-repair.json");
test("second measured compile remains failed in WOFF2, with fixed Pathfinder, source archive and completed owned cleanup", async () => {
  const bytes = await read(proof.rawReceipt); assert.equal(bytes.length, proof.rawReceiptBytes); assert.equal(sha(bytes), proof.rawReceiptSha256);
  const row = JSON.parse(bytes); assert.equal(row.executedHead, proof.failedRun.headSha);
  assert.equal(row.sourceCompilationSucceeded, false); assert.equal(row.rawWasm, null); assert.equal(row.ownedScratchRemoved, true);
  assert.equal(row.commands.at(-1).exitCode, 101); assert.equal(row.commands.at(-1).signal, null);
  assert.match(row.compilerLog.tail, /could not compile `woff2`/); assert.match(row.compilerLog.tail, /23 previous errors/);
  assert.match(row.compilerLog.tail, /SafeBuf/); assert.match(row.compilerLog.tail, /TryGetError/);
  assert.doesNotMatch(row.compilerLog.tail, /error\[E0658\]/);
  const archive = await json(proof.executedSourceArchive); assert.equal(archive.sourceCommit, proof.failedRun.headSha);
  for (const [file, digest] of Object.entries(row.sourcePins)) {
    const old = archive.files[file]; let source;
    if (old) { source = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 }); assert.equal(source.length, old.bytes); assert.equal(sha(source), old.sha256); }
    else source = await read(file);
    assert.equal(sha(source), digest, `Actual second failed-run source: ${file}`);
  }
});
test("Bytes pin comes from an actual published binary data-section witness, not an arbitrary compatible version", async () => {
  const witnesses = await json(proof.publishedVersionWitness.receipt);
  const witness = witnesses.witnesses.find(row => row.name === "bytes");
  assert.equal(witness.version, bytesRepair.to); assert.equal(witness.sectionId, 11);
  assert.equal(bytesRepair.to, "1.6.0"); assert.equal(bytesRepair.from, "1.12.1");
  assert.equal(bytesRepair.candidateOnly, true); assert.equal(bytesRepair.securityOrRenderingQualification, false);
  assert.equal(proof.crateSourceChecks[0].conflictingTryGetMethodsPresent, false);
  assert.equal(proof.crateSourceChecks[1].conflictingTryGetMethodsPresent, true);
});
test("second directed lock edit changes exactly one additional package and never re-resolves the remaining graph", async () => {
  const base = await read("images/resvg-source/Cargo.candidate.lock"), prior = makePathfinderLock(base), next = makePublishedBytesLock(prior);
  const a = prior.toString().split("[[package]]"), b = next.toString().split("[[package]]"); assert.equal(a.length, b.length);
  const changed = a.flatMap((item, index) => item === b[index] ? [] : [[item, b[index]]]); assert.equal(changed.length, 1);
  assert.match(changed[0][0], /name = "bytes"\nversion = "1.12.1"/); assert.match(changed[0][1], /name = "bytes"\nversion = "1.6.0"/);
  assert.equal(changed[0][1].replace('version = "1.6.0"', 'version = "1.12.1"').replace(bytesRepair.newChecksum, bytesRepair.oldChecksum), changed[0][0]);
  assert.throws(() => makePublishedBytesLock(base)); assert.throws(() => makePublishedBytesLock(next));
});
test("Bytes private CI scope cannot rerun either failed control or any normal public gate", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const jobs = yaml.load((await read(".github/workflows/ci.yml")).toString()).jobs;
  assert.match(jobs["engine-matrix"].if, /inputs.engine != 'svg-source-compile-bytes'/);
  for (const id of ["verify", "browser-conversions", "svg-source-lock", "svg-source-compile", "svg-source-compile-pathfinder"])
    assert.doesNotMatch(jobs[id].if, /svg-source-compile-bytes/);
  const job = jobs["svg-source-compile-bytes"]; assert.equal(job["timeout-minutes"], 20);
  assert.equal(job.if, "github.event_name == 'workflow_dispatch' && inputs.engine == 'svg-source-compile-bytes'");
  assert.equal(job.steps.find(row => row.run?.startsWith("node ")).run, "node images/resvg-source/compile-candidate.mjs --bytes-1.6.0");
});
