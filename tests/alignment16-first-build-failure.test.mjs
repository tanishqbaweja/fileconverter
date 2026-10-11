import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Collector } from "../scripts/lib/alignment16-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual first build stays failed before SDK/native compilation, with log, executed preimages and hosted cleanup", async () => {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/alignment16-first-build-failure-38160211970.json")));
  assert.equal(proof.run.databaseId, 38160211970); assert.equal(proof.run.headSha, "2485242c69fc568f8af02c741ecb75a5ae85272b");
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "failure");
  assert.equal(sha(await readFile(path.join(root, proof.receipt.path))), proof.receipt.sha256);
  assert.equal(sha(proof.failedLog), proof.failedLogSha256); assert.match(proof.failedLog, /3 !== 2/);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(Buffer.from(proof.sourcePreimages[file], "base64")), hash);
  const failed = Buffer.from(proof.sourcePreimages["media/ffmpeg/build-mpeg2-alignment16.mjs"], "base64").toString();
  assert.ok(failed.includes("for (const [before, after] of edits)")); assert.ok(!failed.includes("makeAlignment16Builder"));
  assert.equal(proof.sdkPatchReached, false); assert.equal(proof.nativeCompilationReached, false); assert.equal(proof.hostedCleanupPassed, true);
  assert.equal(proof.originalRead, false); assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
});
test("corrected build collector joins a new branch receipt without weakening original acceptance or ownership gates", async () => {
  const source = await readFile(path.join(root, "scripts/collect-mpeg2-single-idle-build.mjs"), "utf8");
  const corrected = makeAlignment16Collector(source, root, "builder-fix").generated;
  const defaulted = makeAlignment16Collector(source, root).generated;
  assert.equal(corrected.replace("evidence/mpeg2-alignment16-build-branch-2026-10-11-builder-fix.json", "evidence/mpeg2-alignment16-build-branch-2026-10-11.json")
    .replace("assert.equal(process.argv.length, 4)", "assert.equal(process.argv.length, 3)"), defaulted);
  assert.throws(() => makeAlignment16Collector(source, root, "unknown"));
});
