import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveColdRecoveryDriver, deriveColdRecoveryCaller } from "../scripts/lib/cold-recovery-control.mjs";
const root = process.cwd();
test("cold trace begins before first real conversion; production retirement closes it before recovery and failure dump", async () => {
  const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const result = deriveColdRecoveryDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ['windowKind:"cold-start"', 'firstCodec[0].once("close"', 'coldExecution.stop("before-recovery-window")', "successfulFixtureValidations,6", "minimumMs: 300000", "<=250"])
    assert.ok(result.generated.includes(token), token);
  assert.ok(result.generated.indexOf("await coldExecution.start()") < result.generated.indexOf("completedSaveControl.run(page)"));
  assert.ok(result.generated.indexOf('coldExecution.stop("before-recovery-window")') < result.generated.indexOf("recoveryExecution=createRecoveryExecutionTrace"));
  await transform(result.generated, { loader: "js" });
});
test("caller remains diagnostic with unchanged private builder and birth-safe finally cleanup", async () => {
  const result = deriveColdRecoveryCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-cold-recovery-control-live.json', '"scripts/build-catalogue-slot.mjs",stamp,"--for-browser"', "await verifyStoppedTree()"])
    assert.ok(result.generated.includes(token), token);
  assert.equal(result.publicAcceptance, false); await transform(result.generated, { loader: "js" });
});
