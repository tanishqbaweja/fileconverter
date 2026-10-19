// Read-only re-audit of completed ABBA, no browser/fixtures/conversion/retry.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile, access, lstat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { auditJspiLtoBlock } from "./lib/jspi-lto-block-audit.mjs";
import { compareJspiLtoScreen } from "./lib/jspi-lto-speed-screen.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), file = process.argv[2];
assert.match(file ?? "", /^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-jspi-lto-speed-screen\.json$/);
const bytes = await readFile(path.join(root, file)), state = JSON.parse(bytes);
assert.equal(state.status, "finished-order-balanced-screen-not-public-acceptance");
assert.equal(state.failure, null); assert.deepEqual(state.cleanupErrors, []); assert.equal(state.active, null);
assert.equal((await observeOwnedProcessExit(state.identity)).status, "owned-identity-absent");
assert.equal(Object.keys(state.ownSources).length, 11);
for (const [name, row] of Object.entries(state.ownSources)) {
  assert.equal(sha(Buffer.from(row.preimage, "base64")), row.sha256); assert.equal(sha(await readFile(path.join(root, name))), row.sha256);
}
let validSamples = 0, traceBytesRemoved = 0, ownedBirthsRechecked = 1;
for (const stored of state.blocks) {
  const audited = await auditJspiLtoBlock(root, stored.variant, stored.terminal.path);
  const original = structuredClone(stored); delete original.compaction; delete original.wrapperIdentity; delete original.wrapperExit;
  assert.deepEqual(audited, original);
  assert.equal((await observeOwnedProcessExit(stored.wrapperIdentity)).status, "owned-identity-absent");
  ownedBirthsRechecked += stored.audit.recordedBirths.length + 1;
  const record = stored.compaction.checkpoint, zipped = await readFile(path.join(root, record.path));
  assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 1048576 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
  await assert.rejects(access(stored.checkpoint.file), { code: "ENOENT" });
  const trace = stored.compaction.disposableSuccessTrace; assert.equal(trace.removed, true);
  assert.equal(path.dirname(path.resolve(root, trace.path)), path.join(root, "outputs/reports"));
  await assert.rejects(access(path.resolve(root, trace.path)), { code: "ENOENT" });
  traceBytesRemoved += trace.bytes; validSamples += stored.analysis.conversionValidSamples;
}
assert.deepEqual(compareJspiLtoScreen(state.blocks), state.comparison);
assert.deepEqual(state.originalBefore, state.originalAfter);
const source = path.join(root, "test.mkv"), stat = await lstat(source); assert.equal(stat.size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(source, { highWaterMark: 1048576 })) digest.update(chunk);
assert.equal(digest.digest("hex"), state.originalAfter.sha256);
assert.equal(sha(await readFile(path.join(root, "dist/client" + baselineBinding.url))), baselineBinding.sha256);
const ownSources = {};
for (const name of ["scripts/inspect-jspi-lto-speed-screen.mjs", "tests/jspi-lto-screen-evidence.test.mjs"]) {
  const value = await readFile(path.join(root, name)); ownSources[name] = { sha256: sha(value), preimage: value.toString("base64") };
}
console.log(JSON.stringify({ status: "completed-abba-independently-replayed-not-general-speed-or-public-acceptance",
  screen: { path: file, sha256: sha(bytes) }, allFourBlockAuditsExactlyReproduced: true, all11ScreenPreimagesCurrent: true,
  originalUnchanged: state.originalAfter, normalProductionRestored: true, ownedBirthsRechecked,
  ownedScratchDirectoriesAbsent: 20, completeOutputsValidated: 24, faultRecoveriesValidated: 12, validSamples,
  unavailableSamples: 0, disposableSuccessTraceBytesPermanentlyRemoved: traceBytesRemoved,
  compactionHashesAndAbsenceVerified: true, comparison: state.comparison, ownSources,
  nextAction: "Record library-LTO rejected on this workload; do not repeat unchanged build/screen or spend multi-hour original runs based on this failed screen. Qualified baseline remains unchanged. Finish original cold/scaling/public gates or investigate a separately evidenced optimization.",
  publicAcceptance: false }));
