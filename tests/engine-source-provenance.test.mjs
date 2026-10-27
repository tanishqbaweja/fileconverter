import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const read = file => readFile(path.join(root, file));
const json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = await json("evidence/2026-10-27-engine-source-provenance.json");
const history = await json(proof.inventoryReceipt);
const command = (...args) => execute(process.execPath, ["scripts/engine-reproducibility-manifest.mjs", ...args],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });

test("all twelve declared no-Docker entries distinguish eleven source recipes from the pinned SVG package copy", async () => {
  const matrix = JSON.parse((await command("--non-docker")).stdout).include;
  assert.equal(matrix.length, 12);
  assert.equal(matrix.filter(row => row.reproductionKind === "native-source").length, 11);
  assert.deepEqual(matrix.filter(row => row.reproductionKind === "pinned-package-copy").map(row => row.id), ["svg"]);
  for (const row of matrix) assert.doesNotMatch(row.command, /\bdocker\b/);
  assert.equal(matrix.find(row => row.id === "svg").command, "npm run build:svg");
});
test("normal audit is inventory only and strict source-completeness gate fails on SVG instead of silently passing", async () => {
  const lines = (await command("--check")).stdout.trim().split(/\r?\n/);
  assert.match(lines[0], /12 published/);
  const inventory = JSON.parse(lines[1]);
  assert.equal(inventory.scope, "recipe-inventory-not-executed-rebuild-proof");
  assert.equal(inventory.nativeSourceRecipes, 11); assert.deepEqual(inventory.pinnedPackageCopies, ["svg"]);
  assert.equal(inventory.allPublishedEnginesHaveSourceRecipes, false);
  await assert.rejects(command("--check", "--require-source-builds"), error => error.code === 1 && /Source-only reproduction is incomplete: svg/.test(error.stderr));
  await assert.rejects(command("--require-source-builds"), error => error.code === 1 && /requires --check/.test(error.stderr));
});
test("current artifact inventory pins actual bytes and retains the sole manifest difference without replaying binaries", async () => {
  assert.equal(history.driverSha256, sha(await read("scripts/audit-published-engine-history.mjs")));
  assert.equal(history.manifestSha256, sha(await read("scripts/engine-reproducibility-manifest.mjs")));
  assert.equal(history.summary.publishedDirectories, 12);
  assert.equal(history.summary.whollyUnchangedHistoricalDirectories, 11);
  assert.deepEqual(history.summary.changedFiles, ["public/engines/remux/build-manifest.json"]);
  assert.equal(history.engines.length, 12);
  for (const engine of history.engines) for (const file of engine.files) {
    const hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of createReadStream(path.join(root, file.path), { highWaterMark: 262144 })) { hash.update(chunk); bytes += chunk.length; }
    assert.equal(bytes, file.bytes, file.path); assert.equal(hash.digest("hex"), file.sha256, file.path);
    assert.equal(file.sameHistoricalBytes, file.gitBlob === file.historicalGitBlob);
  }
  assert.equal(history.allPublishedEnginesSourceRebuilt, false); assert.equal(history.conversionRun, false);
  assert.equal(history.dockerUsed, false); assert.equal(history.protectedTestMkvRead, false);
});
test("retained inspector proof is scoped, direct proof is one core, and upstream producer metadata does not invent a Rust lock", async () => {
  const inspector = proof.remoteHistoryRevalidated.find(row => row.engine === "jxl-inspector");
  assert.equal(inspector.conclusion, "success"); assert.equal(inspector.exactComparisonObserved, true);
  assert.equal(inspector.verifyAndBrowserJobsSkippedNotPassed, true);
  assert.equal(proof.remoteHistoryRevalidated.find(row => row.runId === 35809382089).coreFilterObserved, "within-direct");
  const gap = proof.svgSourceGap;
  assert.equal(gap.upstreamCargoLockPresent, false); assert.equal(gap.upstreamRecursiveTreeTruncated, false);
  assert.equal(gap.upstreamWasmPackVersion, "latest"); assert.equal(gap.sourceRebuildAttempted, false);
  const moduleBytes = await read("public/engines/svg/resvg.wasm");
  assert.equal(sha(moduleBytes), gap.publishedWasmSha256); assert.equal(moduleBytes.length, gap.publishedWasmBytes);
  const producer = WebAssembly.Module.customSections(new WebAssembly.Module(moduleBytes), "producers");
  assert.equal(producer.length, 1);
  const producerText = Buffer.from(producer[0]).toString();
  for (const field of ["publishedWasmProducerRustc", "publishedWasmProducerWalrus", "publishedWasmProducerWasmBindgen"])
    assert.ok(producerText.includes(gap[field]), field);
  const source = (await read(gap.currentRecipe)).toString(); assert.match(source, /await copyFile\(source, destination\)/);
  assert.doesNotMatch(source, /cargo|rustup|wasm-pack build/);
  assert.equal(proof.allPublishedEnginesSourceRebuilt, false); assert.equal(proof.publicEngineReplacement, false);
});
