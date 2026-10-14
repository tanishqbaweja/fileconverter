// Offline current-ABI validation of captured words only. No invented heap/core.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { reallocFailureValidatorDerivation } from "./realloc-full-failure-record.mjs";
import { MVF_DECODER_SHA256 } from "./mvf-arena-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const proof = JSON.parse(await readFile(path.join(root, "evidence/mvf-arena-native-38643550000.json")));
assert.equal(proof.decoder.sha256, MVF_DECODER_SHA256);
const REALLOC_SLOT = proof.layout.within_realloc_attempt_words.address;
const observer = await readFile(path.join(root, "scripts/lib/realloc-attempt-abort-capture.mjs"), "utf8");
const guards = observer.indexOf("  if (words[0]"); assert.ok(guards > 0);
const decodeSource = 'export function decodeCapturedPendingReallocWords(words) {\n' +
  '  if(!Array.isArray(words)||words.length!==16||!words.every(value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff))throw new Error("Sixteen captured Wasm32 scalar words required");\n' + observer.slice(guards);
const { decodeCapturedPendingReallocWords } = await import("data:text/javascript;base64," + Buffer.from(decodeSource).toString("base64"));
export function validatePendingReallocRecord(row) {
  if (row.role === "encoder") return;
  assert.equal(row.actualReallocSlotAddress, REALLOC_SLOT);
  assert.equal(typeof row.qualifiedReallocCallPath, "boolean"); assert.equal(typeof row.qualifiedBufferReallocCallPath, "boolean");
  if (row.qualifiedReallocCallPath) {
    assert.equal(row.qualifiedDirectBufferCallPath, false); assert.equal(row.qualifiedPoolCallPath, false); assert.equal(row.qualifiedPacketCallPath, false);
    assert.equal(row.allocationAttempt, null); assert.equal(row.latePoolRequest, null);
  }
  if (row.reallocAttempt) {
    assert.equal(row.qualifiedReallocCallPath, true); assert.equal(row.reallocAttemptUnavailable, null);
    const expected = decodeCapturedPendingReallocWords(row.reallocAttempt.words); assert.deepEqual(row.reallocAttempt, expected);
    if (expected.outerBufferScope) assert.equal(row.qualifiedBufferReallocCallPath, true);
    assert.equal(row.allocationApiRequestedBytes, expected.allocationApiRequestedBytes);
    assert.equal(row.failedIndividualAllocationBytes, null); assert.equal(row.wrapperRequestedBytes, null);
  } else { assert.equal(typeof row.reallocAttemptUnavailable, "string"); assert.equal(row.allocationApiRequestedBytes, null); }
}
const source = await readFile(path.join(root, "scripts/lib/composite-allocation-failure-record.mjs"), "utf8");
assert.equal(sha(source), reallocFailureValidatorDerivation.originalSha256);
const edits = reallocFailureValidatorDerivation.edits.map(([before, after], index) => [before, index === 0 ?
  `const ALLOCATION_ATTEMPT_DECODER_SHA256=${JSON.stringify(MVF_DECODER_SHA256)};\n` +
  `const REALLOC_SLOT=${REALLOC_SLOT};\nconst decodeCapturedPendingReallocWords=(${decodeSource.replace("export function ", "function ")});\n${validatePendingReallocRecord.toString()}` :
  index === 1 ? `assert.equal(row.actualAllocatorRoot, ${proof.layout._gm_.address}); assert.equal(row.actualAttemptSlotAddress, ${proof.layout.within_allocator_attempt_words.address}); assert.equal(row.actualPoolSlotAddress, ${proof.layout.within_refstruct_abort_words.address});` : after]);
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let restored = generated; for (const [before, after] of edits.toReversed()) restored = restored.replace(after, before); assert.equal(restored, source);
generated = generated.replace(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm, (match, file) =>
  match.replace(`from "${file}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", file)).href)}`));
const factory = await import("data:text/javascript;base64," + Buffer.from(generated).toString("base64"));
export const validateCompositeAllocationFailureRecord = factory.validateCompositeAllocationFailureRecord;
export const ebmlFailureDerivation = Object.freeze({ originalSha256: sha(source), generatedSha256: sha(generated), edits,
  capturedWordGuardsChanged: false, currentNativeAddresses: proof.layout, heapOrModuleFabricated: false, publicAcceptance: false });
