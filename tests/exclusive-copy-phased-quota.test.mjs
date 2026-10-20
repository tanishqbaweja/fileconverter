import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPreMpeg2JobWorker } from "./helpers/historical-published-ui.mjs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makePhasedQuotaCopyWorker, makePhasedQuotaDiagnostic, planDiagnosticCopyAllocation } from "../scripts/lib/exclusive-copy-phased-quota.mjs";
import { makeStagedCopyDiagnosticWorker } from "../scripts/lib/staged-copy-diagnostic-worker.mjs";
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("sanitized usage-plus10GiB quota is checked against the full additional6.414GB file at each phase, not treated as total capacity", () => {
  const bytes = 6414309978, early = planDiagnosticCopyAllocation({ usage: 0, quota: 10737418240 }, bytes);
  const later = planDiagnosticCopyAllocation({ usage: bytes, quota: bytes + 10737418240 }, bytes);
  assert.equal(early.additionalBytesRequiredNow, bytes); assert.equal(later.additionalBytesRequiredNow, bytes);
  assert.equal(early.fullPlannedPeakFileBytes, bytes * 2); assert.equal(early.physicalPreflightMinimumBytes, 32 * 1024 ** 3);
  assert.throws(() => planDiagnosticCopyAllocation({ usage: bytes, quota: bytes * 2 - 1 }, bytes), { name: "QuotaExceededError" });
  for (const value of [{}, { usage: -1, quota: 1 }, { usage: 2, quota: 1 }]) assert.throws(() => planDiagnosticCopyAllocation(value, bytes));
});
test("historical phased worker retains byte-exact original loop and full fixture; generated worker and caller parse", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readPreMpeg2JobWorker();
  const parent = makeStagedCopyDiagnosticWorker(source), worker = makePhasedQuotaCopyWorker(source); syntax(worker.generated);
  let restored = worker.generated; for (const [before, after] of worker.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, parent.generated); assert.equal(worker.fixtureBytes, 6414309978); assert.equal(worker.productionLoopSha256, parent.productionLoopSha256);
  const caller = makePhasedQuotaDiagnostic(await readFile(path.join(root, "scripts/benchmark-exclusive-staged-copy.mjs"), "utf8"), root); syntax(caller.generated);
  assert.ok(caller.generated.includes("server.closeAllConnections()")); assert.ok(caller.generated.includes("state.currentOperation"));
  assert.ok(caller.generated.includes("fullOriginalAcceptance: false")); assert.ok(caller.generated.includes("primaryLimitMiB: 250"));
});
