import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual second failed run/log and all six failed-HEAD sources stay retained; no native or browser success invented", async () => {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/alignment16-hosted-failure-38160580276.json")));
  assert.equal(proof.run.databaseId, 38160580276); assert.equal(proof.run.headSha, "6fdb74d2b8956b4a2eb3c60f1e7b36020fef4bc7");
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "failure");
  assert.equal(sha(await readFile(path.join(root, proof.receipt.path))), proof.receipt.sha256);
  assert.equal(sha(proof.failedLog), proof.failedLogSha256); assert.match(proof.failedLog, /ERR_MODULE_NOT_FOUND/);
  assert.match(proof.failedLog, /alignment16-builder-[^/]+\/mpeg2-single-idle-source\.mjs/);
  assert.equal(Object.keys(proof.sourcePins).length, 6);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(Buffer.from(proof.sourcePreimages[file], "base64")), hash);
  assert.equal(proof.sourcesMatchedActualFailedGitHead, true); assert.equal(proof.hostedCleanupPassed, true);
  assert.equal(proof.originalRead, false); assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
});
