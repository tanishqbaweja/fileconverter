// Same scalar validation, explicitly admitting the newly qualified packet path.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const original = await readFile(path.join(root, "scripts/lib/composite-allocation-failure-record.mjs"), "utf8");
assert.equal(sha(original), "b017acf4e5abb6092e45b46eda7618800f38d04da3adbcb3c174baf8e23cfd16");
const edits = [
  ['from "./allocation-attempt-abort-capture.mjs"', `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-largest-idle-attempt-abort-capture.mjs")).href)}`],
  ['["qualifiedDirectBufferCallPath", "qualifiedPoolCallPath"]', '["qualifiedDirectBufferCallPath", "qualifiedPoolCallPath", "qualifiedPacketCallPath"]'],
  ["assert.equal(row.qualifiedDirectBufferCallPath, true);", "assert.equal(row.qualifiedDirectBufferCallPath || row.qualifiedPacketCallPath, true);"],
];
let generated = original;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
assert.equal(reversed, original);
const validator = await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
export const validateCompositeAllocationFailureRecord = validator.validateCompositeAllocationFailureRecord;
export const failureValidatorDerivation = Object.freeze({ originalSha256: sha(original), generatedSha256: sha(generated), edits });
