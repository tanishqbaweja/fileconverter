import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeLargestBurstDriver } from "../scripts/lib/mpeg2-largest-burst-recipe.mjs";
test("changed original diagnostic preserves all source/quality/native gate while closing detailed traces independently", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
  const generated = makeLargestBurstDriver(source, root, s => import.meta.resolve(s), "file:///owned/attribution.mjs");
  for (const token of ["const diagnosticOnly = true", "70 * 60_000", "32 * MiB", "createIndependentBlinkSessions",
    "await rendererAttribution.stop()", "observer.setPhase(\"finally-cleanup\")", "incrementalPrivateMiB <= 250",
    "startupSettlement.minimumMs", "minimumMs: 300000", "no baseline substitution", "await verifySource()",
    "observeOwnedProcessExit(identity)", "nativePeaks = observer.peaks", "completedReport = report", "ssim >= 0.98"])
    assert.ok(generated.includes(token), token);
  assert.equal(generated.includes("Owned Chrome root must actually be absent"), false);
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => makeLargestBurstDriver(source + "\n", root, s => import.meta.resolve(s), "file:///owned/attribution.mjs"));
});
