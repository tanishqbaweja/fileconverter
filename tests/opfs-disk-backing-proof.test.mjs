// Bounded OS/canary doubles and source wiring, not real browser acceptance.
import assert from "node:assert/strict";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { verifyOpfsDiskBacking } from "../scripts/lib/opfs-disk-backing-proof.mjs";
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
  assert.match(source, /SystemInfo.getProcessInfo/); assert.match(source, /!command.arguments.includes\("--incognito"\)/);
  assert.ok(source.indexOf("await verifyOpfsDiskBacking(page, profileDirectory)") < source.indexOf("const tasks = [ui ?"));
  assert.match(source, /peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /if \(persistentOpfsContext\)/);
});
