import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { readPreCiRuntimeInput } from "./helpers/pre-ci-runtime-inputs.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
test("two actual fresh remapped source builds have byte-identical raw Wasm, fixed locked inputs and independently removed scratch", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-svg-source-repeat-terminal.json")), pin = JSON.parse(await read(proof.artifactPin));
  const members = new Map(pin.members.map(row => [row.name, row]));
  const topBytes = await read(proof.repeatReceipt), expected = members.get(pin.summaryMember);
  assert.equal(topBytes.length, expected.bytes); assert.equal(sha(topBytes), expected.sha256);
  const top = JSON.parse(topBytes); assert.equal(top.status, "two-fresh-private-remapped-raw-source-builds-byte-identical-not-browser-acceptance");
  assert.deepEqual(top.failures, []); assert.equal(top.rawBytesEqual, true); assert.equal(top.builds.length, 2);
  assert.notEqual(top.builds[0].runtimeFromReceipt, top.builds[1].runtimeFromReceipt);
  assert.equal(top.secondOwnedRawAndLockRemovedAfterExactVerification, true); assert.equal(top.ownedDriverScratchRemoved, true);
  assert.equal(top.publicEngineUnchanged, true); assert.equal(top.bindgenProcessingAttempted, false);
  assert.equal(top.publicEngineReplacement, false); assert.equal(proof.browserQualificationForNewBytesProven, false);
  for (const [index, file] of proof.compilerReceipts.entries()) {
    const bytes = await read(file), expected = members.get(pin.compilerReceiptMembers[index]);
    assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256);
    const receipt = JSON.parse(bytes); assert.equal(receipt.sourceCompilationSucceeded, true);
    assert.equal(receipt.ownedScratchRemoved, true); assert.deepEqual(receipt.failures, []);
    assert.equal(receipt.executedHead, pin.headSha); assert.equal(receipt.rawWasm.sha256, proof.rawSha256);
    assert.equal(receipt.rawWasm.bytes, proof.rawBytes); assert.equal(receipt.rawWasm.executed, false);
    assert.equal(receipt.lock.sha256, members.get(pin.lockMember).sha256);
    for (const [source, digest] of Object.entries(receipt.sourcePins)) assert.equal(sha(await readPreCiRuntimeInput(source)), digest, source);
  }
  for (const [file, digest] of Object.entries(top.sourcePins)) assert.equal(sha(await readPreCiRuntimeInput(file)), digest, file);
});
