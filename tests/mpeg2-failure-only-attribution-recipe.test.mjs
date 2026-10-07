import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeFailureOnlyOriginalDriver } from "../scripts/lib/mpeg2-failure-only-attribution-recipe.mjs";
test("changed full original defers ONE detailed trace until actual native failure, preserving all quality/formula/source/cleanup gates", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
  const generated = makeFailureOnlyOriginalDriver(source, root, s => import.meta.resolve(s), "file:///owned/attribution.mjs");
  for (const token of ["const diagnosticOnly = true", "getBlankBaseline: () => blankBaseline", "onFailure: async event",
    "Only one post-failure trace, none at startup", "finishCapture()", "rendererAttributionResult.sessions.length, 1",
    "incrementalPrivateMiB <= 250", "minimumMs: 300000", "blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes",
    "wasmMemoryBytes, 48 * MiB", "ssim >= 0.98", "await verifySource()", "await emptyOpfs()", "observeOwnedProcessExit(identity)",
    "70 * 60_000", "No tracing before this point"])
    assert.ok(generated.includes(token), token);
  assert.equal(generated.includes('dump("pre-conversion-attribution"'), false);
  assert.equal(generated.includes("startBurstMemoryObserver"), false);
  assert.equal(generated.match(/rendererAttribution\.dump\(/g).length, 1);
  assert.ok(generated.indexOf("observer.finishCapture()") < generated.indexOf("await cancelBrowserConversionBeforeCleanup(page)"));
  assert.ok(generated.indexOf("await rendererAttribution.stop()") < generated.indexOf("await observer.stop()"));
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => makeFailureOnlyOriginalDriver(source + "\n", root, s => import.meta.resolve(s), "file:///owned/attribution.mjs"));
});
