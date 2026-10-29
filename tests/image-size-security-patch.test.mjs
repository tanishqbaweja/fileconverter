import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { imageSize as esmImageSize } from "image-size";
import { readPreImageSizePatch } from "./helpers/pre-image-size-patch.mjs";
import { readPreOgSecurityInput } from "./helpers/pre-og-security-inputs.mjs";
import { readPreSvgMemoryInput } from "./helpers/pre-svg-memory-inputs.mjs";
const json = async file => JSON.parse(await readFile(file));
const sha = b => createHash("sha256").update(b).digest("hex");
const consumer = createRequire(path.resolve("node_modules/vinext/package.json"));
test("historical image-size cycle changes only that dependency; current dimension consumer remains patched", async () => {
  const before = JSON.parse(await readPreImageSizePatch("package-lock.json")), after = JSON.parse(await readPreOgSecurityInput("package-lock.json"));
  assert.deepEqual(Object.keys(after.packages), Object.keys(before.packages));
  assert.deepEqual(Object.keys(after.packages).filter(key => JSON.stringify(after.packages[key]) !== JSON.stringify(before.packages[key])), ["node_modules/image-size"]);
  assert.equal(after.packages["node_modules/image-size"].version, "2.0.3");
  const installed = await json("node_modules/image-size/package.json"); assert.equal(installed.version, "2.0.3");
  assert.equal(installed.dependencies, undefined);
  assert.equal(consumer.resolve("image-size"), path.resolve("node_modules/image-size/dist/cjs/index.js"));
  const oldPkg = JSON.parse(await readPreImageSizePatch("package.json")), pkg = JSON.parse(await readPreOgSecurityInput("package.json"));
  oldPkg.overrides["vinext@0.0.50"] = { "image-size": "2.0.3" }; assert.deepEqual(pkg, oldPkg);
});
test("seven real bounded fixtures preserve dimensions and named API in both framework CJS and ESM resolution", async () => {
  const proof = await json("evidence/2026-10-28-image-size-candidate-corrected.json");
  const { imageSize } = consumer("image-size");
  for (const entry of proof.cases.filter(row => row.file)) {
    const bytes = await readFile(entry.file); assert.ok(bytes.length <= 4 * 1048576); assert.equal(sha(bytes), entry.sha256);
    assert.deepEqual(imageSize(bytes), entry.before.value); assert.deepEqual(esmImageSize(bytes), entry.before.value);
  }
});
function box(type, payload, size = payload.length + 8) {
  const head = Buffer.alloc(8); head.writeUInt32BE(size); head.write(type, 4); return Buffer.concat([head, payload]);
}
test("actual framework consumer rejects all three exact zero-length parser controls inside bounded isolated workers", async () => {
  const ispe = Buffer.alloc(12); ispe.writeUInt32BE(1, 4); ispe.writeUInt32BE(1, 8);
  const controls = [Buffer.concat([Buffer.from("icns"), Buffer.from([0,0,0,16]), Buffer.from("icp4"), Buffer.alloc(4)]),
    Buffer.concat([box("ftyp", Buffer.from("heic\0\0\0\0")), box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", ispe, 0)))]))]),
    Buffer.concat([box("JXL ", Buffer.from([13,10,135,10])), box("ftyp", Buffer.from("jxl \0\0\0\0jxl ")), box("jxlp", Buffer.from([0,0,0,0,255,10,0,0]), 0)])];
  const proof = (await json("evidence/2026-10-28-image-size-candidate-corrected.json")).cases.filter(row => row.name);
  for (const [index, bytes] of controls.entries()) {
    assert.equal(sha(bytes), proof[index].sha256);
    const worker = new Worker(`const {parentPort,workerData}=require("node:worker_threads"); const {imageSize}=require(workerData.entry);
      parentPort.once("message",bytes=>{try{imageSize(Buffer.from(bytes));parentPort.postMessage({rejected:false});}
      catch(error){parentPort.postMessage({rejected:true,message:String(error)});}});parentPort.postMessage({ready:true});`,
    { eval: true, workerData: { entry: consumer.resolve("image-size") }, resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 } });
    let timer;
    try {
      const result = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Parser worker startup timeout")), 10000);
        worker.once("error", reject);
        worker.on("message", value => { clearTimeout(timer); if (value.ready) {
          timer = setTimeout(() => reject(new Error("Patched parser did not reject within 1000ms")), 1000); worker.postMessage(bytes);
        } else resolve(value); });
      });
      assert.equal(result.rejected, true); assert.match(result.message, /Invalid (ICNS|HEIF|JXL)/);
    } finally { clearTimeout(timer); await worker.terminate(); }
  }
});
test("retained old failures stay resource-limit failures and patched controls are not conversion acceptance", async () => {
  const before = await json("evidence/2026-10-28-image-size-candidate.json"), after = await json("evidence/2026-10-28-image-size-candidate-corrected.json");
  assert.equal(before.status, "failed-isolated-patch-candidate"); assert.equal(before.cases.length, 7);
  assert.equal(after.status, "passed-isolated-patch-api-and-malformed-parser-controls-not-installed"); assert.equal(after.cases.length, 10);
  for (const row of after.cases.filter(row => row.name)) { assert.equal(row.before.kind, "resource-limit"); assert.equal(row.after.kind, "rejected"); }
  assert.equal(after.ownedScratchRemoved, true); assert.equal(after.installedApplicationGraphChanged, false); assert.equal(after.securityClosure, false);
});
test("fresh complete audit removes both high severity groups but keeps three moderate framework groups open", async () => {
  const before = await json("evidence/2026-10-28-security-audit-refresh.json"), after = await json("evidence/2026-10-28-image-size-patch-audit.json");
  assert.deepEqual(before.metadata.vulnerabilities, { info: 0, low: 0, moderate: 2, high: 2, critical: 0, total: 4 });
  assert.deepEqual(after.audit.metadata.vulnerabilities, { info: 0, low: 0, moderate: 3, high: 0, critical: 0, total: 3 });
  assert.deepEqual(Object.keys(after.audit.vulnerabilities).sort(), ["@vercel/og", "satori", "vinext"]);
  assert.equal(after.auditExitCode, 1); assert.equal(after.cleanup.ownedScratchRemoved, true);
  assert.equal(sha(await readPreOgSecurityInput("package.json")), after.packageSha256); assert.equal(sha(await readPreOgSecurityInput("package-lock.json")), after.lockSha256);
  const priorEntries = (await json("evidence/2026-10-27-cloudflare-audit-after.json")).packageEntries;
  assert.deepEqual(Object.keys(after.packageEntries), Object.keys(priorEntries));
  assert.deepEqual(Object.keys(after.packageEntries).filter(key => after.packageEntries[key] !== priorEntries[key]), ["node_modules/image-size"]);
});
test("changed dependency build passes all nineteen original privacy cases with source and owned cleanup proof", async () => {
  const proof = await json("evidence/2026-10-28-image-size-patch-verification.json"), entry = proof.privacyBrowserReceipt;
  const bytes = await readFile(entry.path); assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256);
  const row = JSON.parse(bytes), audit = await json(proof.dependencyAudit);
  assert.equal(row.status, "passed-complete-headless-privacy-offline-hosting-specs"); assert.equal(row.executedHead, entry.executedHead);
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped, row.stats.flaky], [19,0,0,0]);
  assert.equal(row.sourcePins["package.json"], audit.packageSha256); assert.equal(row.sourcePins["package-lock.json"], audit.lockSha256);
  for (const [file, digest] of Object.entries(row.sourcePins)) assert.equal(sha(await readPreSvgMemoryInput(file)), digest, file);
  assert.equal(row.methodPreflight.length, 5); assert.ok(row.methodPreflight.every(value => value.status === 405 && value.allow === "GET, HEAD"));
  assert.equal(row.assetPreflight.length, 6); assert.ok(row.assetPreflight.every(value => value.status === 200));
  assert.equal(row.ownedRuntimeRemoved, true); assert.equal(row.processCleanup.length, 2);
  assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  assert.deepEqual(row.protectedOriginalBefore, row.protectedOriginalAfter);
  assert.equal(row.protectedOriginalAfter.bytes, proof.originalBytesBeforeAndAfter); assert.equal(row.protectedOriginalAfter.sha256, proof.originalSha256BeforeAndAfter);
  assert.equal(row.headedCoverage, false); assert.equal(row.conversionMemoryAcceptance, false); assert.equal(row.publicPromotion, false);
});
