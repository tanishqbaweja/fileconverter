import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { checkStressHostMemory } from "../scripts/lib/host-memory-preflight.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual changed full launch was held by the unchanged host virtual-memory gate BEFORE conversion, source reads, scratch creation or UI staging", async () => {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T13-59-15-528Z-allocation-attempt-original-full-terminal.json")));
  assert.equal(proof.status, "failed-or-incomplete"); assert.equal(proof.executions, 0);
  assert.equal(proof.hostPreflight.freePhysicalBytes, 4351315968); assert.equal(proof.hostPreflight.freeVirtualBytes, 1706586112);
  assert.deepEqual(checkStressHostMemory({ acquiredAt: proof.hostPreflight.acquiredAt,
    freePhysicalKiB: proof.hostPreflight.freePhysicalBytes / 1024,
    freeVirtualKiB: proof.hostPreflight.freeVirtualBytes / 1024 }), proof.hostPreflight);
  assert.equal(proof.hostPreflight.safeToStart, false); assert.equal(proof.hostPreflight.primaryMemoryFormulaChanged, false);
  assert.ok(proof.hostPreflight.freePhysicalBytes >= 2147483648); assert.ok(proof.hostPreflight.freeVirtualBytes < 2147483648);
  assert.ok(proof.failure.includes("false !== true")); assert.deepEqual(proof.cleanupErrors, []);
  for (const key of ["diskPreflightBytes", "protectedBefore", "protectedAfter", "sourceArchive", "wrapper", "candidateDirectory", "composition", "driverIdentity", "candidate", "buildProof", "launchHostPreflight"])
    assert.equal(proof[key], null, key);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.equal(Object.keys(proof.sourcePins).length, 312);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  for (const key of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(proof[key], false);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.primaryLimitMiB, 250);
});
