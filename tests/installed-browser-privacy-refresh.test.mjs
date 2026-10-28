import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { readPreImageSizePatch } from "./helpers/pre-image-size-patch.mjs";

const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = await json("evidence/2026-10-27-installed-browser-privacy-refresh.json");
const currentTab = "  // Leave browser-owned startup tabs alone; GX Corner can replace their navigation.\n  page = await context.newPage();";
const oldTab = "  page = context.pages()[0] ?? (await context.newPage());";

test("browser refresh driver reuses the complete owned production wrapper without flags, filters or browser mutations", async () => {
  const source = (await read("scripts/run-installed-browser-privacy.mjs")).toString();
  assert.match(source, /Object\.hasOwn\(targets, id\)/);
  assert.match(source, /WITHIN_CHROME_PATH: executable/); assert.match(source, /windowsHide: true/);
  assert.match(source, /createOwnedRuntimeScratch\("installed-browser-privacy-"\)/);
  assert.match(source, /scripts\/run-owned-privacy-offline\.mjs/);
  assert.match(source, /await runtime\?\.close\(\)/);
  assert.match(source, /child\.exitCode !== null/);
  assert.match(source, /assert\.deepEqual\(report\.browserAfter, report\.browserBefore\)/);
  assert.doesNotMatch(source, /--disable-|--headed|--grep|taskkill|ffmpeg|\.replace\(/);
  assert.match(source, /conversionMemoryAcceptance: false/);
});

for (const expected of proof.passed) test(`${expected.browserId} has exactly 19 actual headless passes, pinned binary and original, and completed owned cleanup`, async () => {
  const bytes = await read(expected.path); assert.equal(sha(bytes), expected.sha256);
  const row = JSON.parse(bytes);
  assert.equal(row.status, "passed-existing-19-headless-privacy-cases");
  assert.equal(row.browserId, expected.browserId); assert.equal(row.browserBefore.version, expected.version);
  assert.deepEqual(row.browserBefore, row.browserAfter); assert.match(row.browserBefore.sha256, /^[a-f0-9]{64}$/);
  assert.equal(row.driverSha256, sha(await read("scripts/run-installed-browser-privacy.mjs")));
  assert.equal(row.stats.expected, 19); assert.equal(row.stats.unexpected, 0);
  assert.equal(row.stats.skipped, 0); assert.equal(row.stats.flaky, 0);
  assert.ok(Math.abs(row.stats.duration / 1000 - expected.seconds) < 0.000001);
  assert.equal(row.headed, false); assert.equal(row.osNativePickerVerified, false);
  assert.equal(row.conversionMemoryAcceptance, false); assert.equal(row.publicPromotion, false);
  assert.equal(row.ownedDriverRuntimeRemoved, true); assert.equal(row.ownedProductionRuntimeRemoved, true);
  const raw = await read(row.productionReceipt.path); assert.equal(sha(raw), row.productionReceipt.sha256);
  const actual = JSON.parse(raw);
  assert.deepEqual(actual.protectedOriginalBefore, proof.protectedOriginal);
  assert.deepEqual(actual.protectedOriginalAfter, proof.protectedOriginal);
  assert.ok(actual.processCleanup.length === 2 && actual.processCleanup.every(item => item.status === "owned-identity-absent"));
  for (const [file, digest] of Object.entries(actual.sourcePins)) {
    let source = await readPreImageSizePatch(file);
    if (file === proof.repair.path && digest === proof.repair.beforeSha256) {
      const current = source.toString(); assert.equal(current.split(currentTab).length, 2);
      source = Buffer.from(current.replace(currentTab, oldTab));
    }
    assert.equal(sha(source), digest, `Exact executed source: ${file}`);
  }
});

test("GX startup failure stays failed with 18 unrun, and retained context identifies GX Corner rather than a converter failure", async () => {
  const bytes = await read(proof.failedControl.path); assert.equal(sha(bytes), proof.failedControl.sha256);
  const row = JSON.parse(bytes); assert.equal(row.status, "failed-not-acceptance");
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped], [0, 1, 18]);
  assert.equal(row.ownedDriverRuntimeRemoved, true); assert.equal(row.ownedProductionRuntimeRemoved, true);
  const archive = await json(proof.failedControl.portableExactContextArchive);
  assert.equal(archive.encoding, "gzip-base64"); assert.equal(archive.bytes, 18595);
  const rawContext = gunzipSync(Buffer.from(archive.gzipBase64, "base64"), { maxOutputLength: 32768 });
  assert.equal(rawContext.length, archive.bytes);
  assert.equal(sha(rawContext), "6881215e27be7439a928e2a809c0887cdc06755df456729836ef2435af19e409");
  assert.equal(sha(rawContext), archive.sha256);
  const context = rawContext.toString();
  assert.match(context, /net::ERR_ABORTED/); assert.match(context, /GX Corner/);
});

test("the sole startup repair changes no assertions, retries, limits or browser services; full B07 remains open", async () => {
  const current = (await read(proof.repair.path)).toString();
  assert.equal(sha(current), proof.repair.afterSha256); assert.equal(current.split(currentTab).length, 2);
  assert.equal(sha(current.replace(currentTab, oldTab)), proof.repair.beforeSha256);
  assert.equal(proof.repair.assertionsChanged, false); assert.equal(proof.repair.retryCountChanged, false);
  assert.equal(proof.repair.browserServicesDisabled, false); assert.equal(proof.headed, false);
  assert.equal(proof.conversionMemoryAcceptance, false); assert.equal(proof.fullOriginalOrScalingAcceptance, false);
  assert.equal(proof.publicPromotion, false); assert.ok(proof.remaining.some(item => item.includes("Full B07")));
});
