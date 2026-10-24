// Bounded OS/canary doubles and source wiring, not real browser acceptance.
import assert from "node:assert/strict";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { verifyOpfsDiskBacking } from "../scripts/lib/opfs-disk-backing-proof.mjs";
import { annotateNativeProcessTypes } from "../scripts/lib/chromium-attribution.mjs";
test("OPFS API success is insufficient; only exact64-byte physical canary proves this owned context backing", async () => {
  const runtime = await createOwnedRuntimeScratch("opfs-disk-proof-");
  try {
    const profile = path.join(runtime.directory, "chrome-profile"), backing = path.join(profile, "Default", "File System", "000", "t", "00");
    await mkdir(backing, { recursive: true }); const physical = path.join(backing, "00000001"); let removed = false;
    const page = { async evaluate(fn, arg) {
      if (typeof arg === "object") { await writeFile(physical, arg.nonce, { flag: "wx" }); return 64; }
      await unlink(physical); removed = true;
    } };
    const proof = await verifyOpfsDiskBacking(page, profile);
    assert.equal(proof.status, "exact-browser-canary-independently-found-on-disk"); assert.equal(proof.maximumReadBytes, 65);
    assert.equal(proof.browserBytes, 64); assert.equal(proof.physicalBytes, 64); assert.equal(removed, true);
    assert.equal(proof.provesConversionAcceptance, false); assert.equal(proof.canaryRemovedInFinally, true);
    let cleaned = false;
    await assert.rejects(verifyOpfsDiskBacking({ async evaluate(fn, arg) { if (typeof arg === "object") return 64; cleaned = true; } }, profile), /not found on disk/);
    assert.equal(cleaned, true);
    await assert.rejects(verifyOpfsDiskBacking(page, path.resolve("test.mkv")));
  } finally { await runtime.close(); }
});
test("normal context uses a fresh owned profile and unchanged full-tree baseline; proof precedes conversion", async () => {
  const source = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /chromium.launchPersistentContext\(profileDirectory, \{ executablePath: browserPin.launcher.path, headless: true, env, serviceWorkers: "block" \}\)/);
  assert.match(source, /profileDirectory = path.join\(work, "chrome-profile"\); await mkdir\(profileDirectory\)/);
  assert.match(source, /SystemInfo.getProcessInfo/); assert.match(source, /incognitoContextRequested: false/);
  assert.doesNotMatch(source, /send\("Browser.getBrowserCommandLine"/);
  assert.match(source, /birthIdentity: browserIdentity/);
  assert.ok(source.indexOf("await verifyOpfsDiskBacking(page, profileDirectory)") < source.indexOf("const tasks = [ui ?"));
  assert.match(source, /peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /if \(persistentOpfsContext\)/);
});
test("first persistent setup failure is not conversion evidence or complete browser birth-identity cleanup", async () => {
  const receipt = JSON.parse(await readFile(new URL("../evidence/2026-10-24T13-12-26.461Z-mpeg2-original-result.json", import.meta.url)));
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.completedCases.length, 0); assert.equal(receipt.memory, null);
  assert.ok(receipt.failures.some(s => s.includes("Browser.getBrowserCommandLine")));
  assert.equal(receipt.cleanup.reportedAllOwnedProcessesAbsent, true);
  assert.equal(receipt.cleanup.rootIdentityCoverageComplete, false); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, false);
  assert.equal(receipt.independentCleanup.length, 1); assert.equal(receipt.cleanup.disposableOutputDeleted, true);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true);
});
test("actual normal OPFS disk proof passes but all1685 samples retain the identified on-device model child and434MiB failure", async () => {
  const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T13-17-30.289Z-mpeg2-original-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed); assert.equal(sha(raw), receipt.archive.restoredSha256); const r = JSON.parse(raw);
  const storage = receipt.storageContext; assert.equal(storage.mode, "fresh-persistent-normal-context");
  assert.equal(storage.diskBackingVerified, true); assert.equal(storage.diskProof.physicalBytes, 64);
  assert.equal(storage.diskProof.maximumReadBytes, 65); assert.equal(storage.diskProof.canaryRemovedInFinally, true);
  assert.equal(storage.diskProof.provesConversionAcceptance, false); assert.equal(storage.commandLineRequested, false);
  const journal = await readFile(new URL("output/playwright/2026-10-24T13-17-30.289Z-mpeg2-original-memory.ndjson.gz", root));
  assert.equal(sha(journal), receipt.losslessMemoryJournal.archiveSha256);
  const bytes = gunzipSync(journal); assert.equal(sha(bytes), receipt.losslessMemoryJournal.sha256);
  const samples = bytes.toString().trim().split("\n").map(line => JSON.parse(line).sample);
  assert.equal(samples.length, 1685); assert.ok(samples.every((s, i) => s.sequence === i + 1 && s.privateBytes !== null));
  for (const s of samples) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
  annotateNativeProcessTypes(samples, r.attribution.references, storage.browserPidFromCdp);
  const peak = samples.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 434.8515625);
  const child = peak.processes.find(p => p.utilitySubtype === "on_device_model.mojom.OnDeviceModelService");
  assert.equal(child.pid, 21720); assert.equal(child.parentPid, storage.browserPidFromCdp);
  assert.equal(child.createdAt, "2026-10-24T13:20:45.0039247Z"); assert.equal(child.privateBytes / 1048576, 229.21484375);
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.completedCases.length, 0);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.rootIdentityCoverageComplete, true);
  assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true); assert.equal(receipt.networkObservation.sameOriginGetOnly, true);
});
