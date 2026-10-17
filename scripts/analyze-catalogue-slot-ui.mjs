import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile, access, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeCatalogueSlotReuse } from "./lib/catalogue-slot-reuse.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const file = "evidence/2026-10-17T18-20-55-174Z-catalogue-slot-ui.json", raw = await read(file), ui = JSON.parse(raw);
assert.equal(ui.status, "passed-component-only-all-routes-exact-reused-slots"); assert.equal(ui.failure, null); assert.deepEqual(ui.cleanupErrors, []);
assert.equal(ui.conversions, 0); assert.equal(ui.runtimeRemoved, true); await assert.rejects(access(ui.runtimeDirectory), { code: "ENOENT" });
assert.equal(Object.keys(ui.sources).length, 12); for (const [source, record] of Object.entries(ui.sources)) assert.equal(sha(await read(source)), record.sha256, source);
assert.deepEqual(ui.slotRecipe, makeCatalogueSlotReuse((await read("app/converter/PublishedFormatsCatalogue.tsx")).toString()));
assert.equal(ui.registryCount, 405); assert.equal(ui.cases.length, 2);
for (const row of ui.cases) {
  assert.equal(row.pages, 17); assert.equal(row.maxMounted, 24); assert.equal(row.reusedArticleComparisons, 381); assert.equal(row.reusedChildComparisons, 1524);
  assert.deepEqual(row.slotMutations, { addedArticles: 0, removedArticles: 3 });
  for (const key of ["allCardsExact", "allIdsExact", "keyboardNavigation", "searchAndEmptyAndReset", "noHorizontalOverflow"]) assert.equal(row[key], true);
}
const previous = JSON.parse(gunzipSync(await read("evidence/2026-10-17T17-22-49-473Z-bounded-catalogue-ui.json.gz")));
assert.equal(ui.referenceCardsSha256, previous.referenceCardsSha256); assert.equal(ui.registryIdsSha256, previous.registryIdsSha256);
const screenshots = [];
for (let index = 0; index < ui.screenshots.length; index++) {
  const current = ui.screenshots[index], prior = previous.screenshots[index];
  assert.equal(current.sha256, prior.sha256); assert.deepEqual(await read(current.path), await read(prior.path));
  assert.equal(path.dirname(path.join(root, current.path)), path.join(root, "output/playwright"));
  screenshots.push({ removedDuplicate: current.path, retained: prior.path, sha256: current.sha256, exactPixels: true, visuallyReviewed: true });
}
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const current = JSON.parse((await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 })).stdout);
const births = ui.absences.map(row => { assert.equal(row.status, "owned-identity-absent"); const live = current.find(process => process.pid === row.identity.pid);
  assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(row.identity.createdAt)) > 1); return { identity: row.identity, absentNow: true, pidReusedNoAction: Boolean(live) }; });
const compact = async (name, bytes) => {
  const zipped = gzipSync(bytes, { level: 9 }); await writeFile(path.join(root, name + ".gz"), zipped, { flag: "wx" });
  assert.deepEqual(gunzipSync(await read(name + ".gz")), bytes); await rm(path.join(root, name));
  return { path: name + ".gz", bytes: zipped.length, sha256: sha(zipped), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
};
const report = await compact(file, raw);
const failedPath = "evidence/2026-10-17T18-20-30-695Z-catalogue-slot-ui.json", failedRaw = await read(failedPath), failed = JSON.parse(failedRaw);
assert.equal(failed.cases.length, 0); assert.equal(failed.identity, undefined); assert.equal(failed.runtimeRemoved, true);
await assert.rejects(access(failed.runtimeDirectory), { code: "ENOENT" }); assert.deepEqual(failed.cleanupErrors, []);
const failedPreparation = await compact(failedPath, failedRaw);
for (const screenshot of screenshots) await rm(path.join(root, screenshot.removedDuplicate));
const result = { recordedAt: new Date().toISOString(), status: "private-slot-reuse-component-qualified-not-conversion-memory-accepted",
  report, failedPreparation, all12CurrentSourcesMatchExecutedPreimages: true, exactRecipeReconstructed: true,
  cases: ui.cases, births, screenshots, all405RoutesRetained: true, mediaConversions: 0, memoryAcceptance: false, speedGainProven: false,
  headedCoverage: false, nextAction: "Private production build overlay for the stateless catalogue module, then unchanged six-output/adverse recovery/all-tree250MiB qualification. No copied files outside repository and no public promotion from UI evidence." };
const output = "evidence/2026-10-17-catalogue-slot-ui-analysis.json"; await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, report, birthsChecked: births.length, exactPixelCases: screenshots.length }));
