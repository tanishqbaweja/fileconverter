import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { startAiffNativeAttribution } from "../scripts/lib/aiff-id3-native-attribution.mjs";
import { makeAiffId3NativeAttributionRecipe, makeAiffId3NativeAttributionLaunchRecipe } from "../scripts/lib/aiff-id3-native-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const metadata = socket => ({ ok: true, body: [Buffer.from(JSON.stringify({ webSocketDebuggerUrl: socket }))] });
test("Native attribution source reverses exactly to frozen diagnostic; fixture/core/250MiB/quality/repeats remain intact and hidden/headless", async () => {
  const driver = makeAiffId3NativeAttributionRecipe(await readFile(path.join(root, "scripts/memory-profile.mjs"), "utf8"), root, path.join(root, "work/not-created-native-recipe"));
  const launch = makeAiffId3NativeAttributionLaunchRecipe(await readFile(path.join(root, "scripts/validate-aiff-id3-stress.mjs"), "utf8"), root);
  for (const generated of [driver.generated, launch.generated]) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); assert.ok(generated.includes("windowsHide: true"));
  }
  for (const token of ["--headless=new", "decoded-pcm-sha256", "<= 250", "90_000", "native-attribution.json", "Refusing reused or unrelated PID cleanup"])
    assert.ok(driver.generated.includes(token), token);
  assert.ok(launch.generated.includes('WITHIN_RUN_COUNT: "3"'));
  assert.ok(launch.generated.includes("nativeAttributionEvidence")); assert.ok(launch.generated.includes("publicAcceptance: false"));
});
test("Native diagnostic requests exactly eight distinct phases and releases real CDP resources once; no acceptance or summed allocator claim", async () => {
  let closes = 0, detaches = 0, stops = 0; const calls = [];
  const observer = await startAiffNativeAttribution({ async newBrowserCDPSession() { return { async detach() { detaches++; } }; } }, 9222, "http://127.0.0.1:3000", {
    fetchVersion: async () => metadata("ws://127.0.0.1:9222/devtools/browser/test"),
    connectSampler: async () => ({ close() { closes++; } }),
    startAttribution: async () => ({ async dump(phase, processes) { calls.push({ phase, processes }); return { success: true }; },
      async stop() { stops++; return { status: "completed-diagnostic", summedAllocatorTotal: null }; } }),
  });
  for (const phase of ["blank-idle", "loaded-idle", "conversion-1", "cleanup-1", "conversion-2", "cleanup-2", "conversion-3", "cleanup-3"])
    { await observer.dumpOnce(phase, null); await observer.dumpOnce(phase, null); }
  await assert.rejects(observer.dumpOnce("conversion-4", []));
  const report = await observer.stop(); assert.deepEqual(await observer.stop(), report);
  assert.equal(calls.length, 8); assert.ok(calls.every(row => row.processes === null));
  assert.equal(report.productionAcceptance, false); assert.equal(report.allocationCauseProven, false);
  assert.equal(closes, 1); assert.equal(detaches, 1); assert.equal(stops, 1);
});
test("Native diagnostic rejects foreign/oversized browser metadata and releases startup/shutdown failures without converting null to zero", async () => {
  for (const response of [metadata("ws://other.example:9222/devtools/browser/test"), { ok: true, body: [Buffer.alloc(16385)] }]) {
    let connected = false;
    await assert.rejects(startAiffNativeAttribution({}, 9222, "http://127.0.0.1:3000", {
      fetchVersion: async () => response, connectSampler: async () => { connected = true; },
    })); assert.equal(connected, false);
  }
  let closes = 0, detaches = 0;
  await assert.rejects(startAiffNativeAttribution({ async newBrowserCDPSession() { return { async detach() { detaches++; } }; } }, 9222, "http://127.0.0.1:3000", {
    fetchVersion: async () => metadata("ws://127.0.0.1:9222/devtools/browser/test"), connectSampler: async () => ({ close() { closes++; } }),
    startAttribution: async () => { throw new Error("Trace startup unavailable"); },
  }), /Trace startup unavailable/);
  assert.equal(closes, 1); assert.equal(detaches, 1); closes = 0; detaches = 0;
  const observer = await startAiffNativeAttribution({ async newBrowserCDPSession() { return { async detach() { detaches++; } }; } }, 9222, "http://127.0.0.1:3000", {
    fetchVersion: async () => metadata("ws://127.0.0.1:9222/devtools/browser/test"), connectSampler: async () => ({ close() { closes++; } }),
    startAttribution: async () => ({ async stop() { throw new Error("Trace unavailable"); } }),
  });
  const report = await observer.stop(); assert.match(report.error, /Trace unavailable/); assert.equal(report.result, null);
  assert.equal(closes, 1); assert.equal(detaches, 1);
});
