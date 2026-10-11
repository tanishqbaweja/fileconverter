// Post-terminal ONLY. Optional explicit failure diagnosis never becomes acceptance.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeTitleFullTerminalAnalyzer } from "./lib/encoder-plane-title-terminal-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--diagnose-failure"));
const receiptPath = process.argv[2], failureOnly = process.argv[3] === "--diagnose-failure";
assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-encoder-plane-title-original-full-terminal\.json$/);
// Refuse live/prepared/foreign paths before reading any archive or creating scratch.
const receipt = JSON.parse(await readFile(path.join(root, receiptPath), "utf8"));
assert.equal(receipt.executions, 1); assert.equal(receipt.productionRestored, true);
assert.equal(receipt.wrapperAbsent, true); assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
if (failureOnly) {
  assert.equal(receipt.status, "failed-or-incomplete");
  assert.ok(typeof receipt.failure === "string" && receipt.failure.length > 0);
  assert.equal(receipt.candidate.status, "failed");
} else {
  assert.equal(receipt.status, "actual-full-attempt-terminal-independent-analysis-pending");
  assert.equal(receipt.failure, null);
}
const recipe = makeTitleFullTerminalAnalyzer(await readFile(path.join(root,
  "scripts/analyze-encoder-plane-full-terminal.mjs"), "utf8"), root, failureOnly);
const runtime = await createOwnedRuntimeScratch("encoder-plane-title-terminal-");
try {
  const file = path.join(runtime.directory, "analyzer.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
