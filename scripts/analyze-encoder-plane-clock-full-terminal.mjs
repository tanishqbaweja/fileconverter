// Terminal-only independent audit; never launch/continue/restart a conversion.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeClockFullTerminalAnalyzer } from "./lib/encoder-plane-clock-terminal-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 3); const receiptPath = process.argv[2];
assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-encoder-plane-clock-original-full-terminal\.json$/);
const receipt = JSON.parse(await readFile(path.join(root, receiptPath), "utf8"));
assert.equal(receipt.status, "actual-full-attempt-terminal-independent-analysis-pending");
assert.equal(receipt.failure, null); assert.equal(receipt.executions, 1);
assert.equal(receipt.wrapperAbsent, true); assert.equal(receipt.productionRestored, true);
assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
const recipe = makeClockFullTerminalAnalyzer(await readFile(path.join(root, "scripts/analyze-encoder-plane-full-terminal.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("encoder-plane-clock-terminal-");
try {
  const file = path.join(runtime.directory, "analyzer.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
