import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { assertMkvRecoveryPage, currentMkvProductionRecovery, readCurrentMkvProductionRecovery, replayMkvProductionRecovery } from "../scripts/lib/mkv-current-production-recovery.mjs";
import { productionDirectSmallReference } from "../scripts/lib/mkv-production-direct-small-reference.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = await read(currentMkvProductionRecovery.file), report = JSON.parse(bytes), [arm] = report.arms;

test("latest exact served MKV small recovery validates the current cleanup app and actual native samples", async () => {
  const proof = readCurrentMkvProductionRecovery(bytes, report.candidateBuild, report.sourcePins);
  assert.equal(proof.sameProductionSourcesAndNativeCore, true);
  assert.equal(proof.sameStaticCoreAndWorker, true);
  assert.equal(arm.productionPageBinding.browserResponses, 5);
  assertMkvRecoveryPage(arm.productionPageBinding, proof);
  assert.equal(arm.cases[1].cancellationBefore.outputBytes, 11892295);
  assert.equal(arm.cases[3].metrics.outputBytes, 0);
  assert.deepEqual(arm.cases.filter(row => row.state === "complete").map(row => row.validation.outputSha256),
    Array(3).fill("19adadcc74ba2a2acde01de262303ba2dcc43035de371999160c115eb7d750e9"));
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  const archive = await read(arm.archive.file);
  assert.equal(sha(archive), arm.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 16 * 1048576 });
  assert.equal(sha(raw), arm.archive.decodedSha256);
  const active = JSON.parse(raw).filter(s => Date.parse(s.timestamp) >= arm.memory.start && Date.parse(s.timestamp) <= arm.memory.end);
  const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  for (const s of valid) assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
  assert.equal(valid.length, 233);
  assert.equal(active.length - valid.length, 0);
  assert.equal((Math.max(...valid.map(s => s.privateBytes)) - arm.blank.privateBytes) / 1048576, 189.296875);
  assert.equal((arm.cleanupStable.privateBytes - arm.loaded.privateBytes) / 1048576, 37.2734375);
});

test("worker and Wasm equality cannot excuse changed page source or a stale app bundle", async () => {
  const proof = readCurrentMkvProductionRecovery(bytes, report.candidateBuild, report.sourcePins);
  const zero = "0".repeat(64);
  for (const file of ["app/converter/ConverterApp.tsx", "lib/opfs-activity.ts", "workers/conversion.worker.ts"]) {
    assert.throws(() => readCurrentMkvProductionRecovery(bytes, report.candidateBuild, { ...report.sourcePins, [file]: zero }), /changed production source/);
  }
  assert.throws(() => readCurrentMkvProductionRecovery(bytes, { ...report.candidateBuild, runId: "changed" }, report.sourcePins), /Exact native build/);
  assert.throws(() => assertMkvRecoveryPage({ ...proof.page, sha256: zero }, proof), /does not match small recovery/);
  assert.throws(() => assertMkvRecoveryPage({ ...proof.page, relative: "assets/ConverterApp-old.js" }, proof), /does not match small recovery/);
  assert.throws(() => assertMkvRecoveryPage(undefined, proof), /does not match small recovery/);
  assert.throws(() => readCurrentMkvProductionRecovery(Buffer.from(`${bytes}\n`), report.candidateBuild, report.sourcePins));
  const replay = args => replayMkvProductionRecovery({ ...report, productionDirectRecoveryReference: args }, read);
  await assert.rejects(replay({ file: "../../outside" }), /Unrecognized/);
  // A named old receipt is useful for old report replay, but cannot bless the
  // current source pins even though the protected conversion worker is equal.
  await assert.rejects(replay(productionDirectSmallReference), /changed production source/);
  assert.deepEqual(await replay(proof), proof);
});
