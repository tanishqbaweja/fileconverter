import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "browser-compatibility-matrix-2026-09-07.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);
const expectedBrowsers = ["brave", "chrome", "edge", "opera-gx"];
const expectedProfiles = [
  "csv-to-tsv",
  "mkv-to-mp4",
  "png-to-webp",
  "tar-to-zip",
  "txt-to-docx",
];

test("U-05 evidence covers every installed browser and representative engine family", () => {
  assert.equal(evidence.requirement, "U-05");
  assert.equal(evidence.status, "verified-installed-browsers");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.test.result, "4 passed");
  assert.deepEqual(
    evidence.browsers.map((browser) => browser.id).sort(),
    expectedBrowsers,
  );
  assert.deepEqual(
    evidence.matrix.routesPerBrowser.map((route) => route.profileId).sort(),
    expectedProfiles,
  );
  assert.match(evidence.scope, /representative production conversions/);
});

test("every browser has independently validated bounded outputs, privacy, and cleanup", () => {
  for (const browser of evidence.browsers) {
    assert.deepEqual(Object.keys(browser.routes).sort(), expectedProfiles);
    for (const [profileId, route] of Object.entries(browser.routes)) {
      assert.ok(route.elapsedMs > 0, `${browser.id}/${profileId}: elapsed`);
      assert.ok(route.outputBytes > 0, `${browser.id}/${profileId}: bytes`);
      assert.match(route.sha256, /^[a-f0-9]{64}$/, `${browser.id}/${profileId}: hash`);
    }
    assert.deepEqual(browser.network.methods, ["GET"]);
    assert.deepEqual(browser.network.origins, ["http://127.0.0.1:3000"]);
    assert.equal(browser.network.requestBodies, 0);
    assert.equal(browser.network.privateTokensObserved, 0);
    assert.equal(browser.cleanup.partialFailureOutputs, 0);
    assert.equal(browser.cleanup.convertedOutputsRetained, 0);
    assert.equal(browser.cleanup.profileRetained, false);
    assert.equal(browser.diagnosticErrors, 0);
    assert.ok(browser.routes["png-to-webp"].ssim >= 0.9);
  }
  assert.equal(evidence.sharedAssertions.maximumReadChunkBytes, 256 * 1024);
  assert.equal(evidence.sharedAssertions.maximumWriteChunkBytes, 256 * 1024);
  assert.equal(evidence.sharedAssertions.maximumQueuedBytes, 256 * 1024);
  assert.equal(evidence.sharedAssertions.maximumPendingOperations, 1);
  assert.match(evidence.sharedAssertions.unsafeTarError, /Unsafe TAR entry/);
});

test("browser and release limitations remain explicit instead of generalized", () => {
  const chrome = evidence.browsers.find((browser) => browser.id === "chrome");
  const edge = evidence.browsers.find((browser) => browser.id === "edge");
  const brave = evidence.browsers.find((browser) => browser.id === "brave");
  const opera = evidence.browsers.find((browser) => browser.id === "opera-gx");
  assert.equal(chrome.mode, "headed");
  assert.equal(edge.mode, "headed");
  assert.equal(brave.mode, "headed");
  assert.equal(opera.mode, "headless-isolated");
  assert.equal(brave.directoryAccess, false);
  assert.match(brave.limitation, /folder\/batch destination selection/);
  assert.match(opera.limitation, /singleton GX Corner/);
  assert.match(evidence.releaseVerification.opera.finding, /standard Opera was not installed/);
  assert.ok(
    evidence.limitations.some((limitation) =>
      limitation.includes("process-tree private-memory"),
    ),
  );
});

test("the executable matrix keeps production conversion, validators, and cleanup wired", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests", "browser", "browser-compatibility.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    '"csv-to-tsv"',
    '"txt-to-docx"',
    '"tar-to-zip"',
    '"png-to-webp"',
    '"mkv-to-mp4"',
    "await packetHash(outputPath, \"v:0\")",
    "await packetHash(outputPath, \"a:0\")",
    "expect(similarity).toBeGreaterThanOrEqual(0.9)",
    "expect(privateTokensObserved).toEqual([])",
    "expect(leftoverOutputNames).toEqual([])",
    "await rm(outputRoot, { recursive: true, force: true })",
    "await rm(profileRoot, { recursive: true, force: true })",
  ]) {
    assert.ok(source.includes(anchor), anchor);
  }
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
});
