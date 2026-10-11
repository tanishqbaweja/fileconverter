// Post-terminal failure diagnosis only. No converter/browser/rebuild/retry/kill.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeStagedFullFailureAnalyzer } from "./lib/encoder-plane-staged-failure-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 3);
const receiptPath = process.argv[2];
assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-encoder-plane-staged-original-full-terminal\.json$/);
const receipt = JSON.parse(await readFile(path.join(root, receiptPath), "utf8"));
assert.equal(receipt.status, "failed-or-incomplete");
assert.ok(typeof receipt.failure === "string" && receipt.failure.length > 0);
assert.equal(receipt.executions, 1); assert.equal(receipt.candidate.status, "failed");
assert.equal(receipt.productionRestored, true); assert.equal(receipt.wrapperAbsent, true);
assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
const recipe = makeStagedFullFailureAnalyzer(await readFile(path.join(root,
  "scripts/analyze-encoder-plane-full-terminal.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("encoder-plane-failure-audit-");
try {
  const file = path.join(runtime.directory, "analyzer.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
