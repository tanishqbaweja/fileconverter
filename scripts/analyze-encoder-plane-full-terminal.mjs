// Run ONLY after the original wrapper has returned. Never open a browser or retry.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneFullDriver, makeEncoderPlaneFullCaller } from "./lib/encoder-plane-full-recipe.mjs";
import { verifyEncoderPlaneBuildEvidence } from "./lib/encoder-plane-browser-recipe.mjs";
import { encoderPlaneTerminalFacts } from "./lib/encoder-plane-terminal-facts.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 3); const receiptPath = process.argv[2];
assert.match(receiptPath, /^evidence\/\d{4}-\d{2}-\d{2}T[\d-]+Z-encoder-plane-original-full-terminal\.json$/);
const receiptBytes = await read(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.status, "actual-full-attempt-terminal-independent-analysis-pending");
assert.equal(receipt.failure, null); assert.equal(receipt.executions, 1);
assert.equal(receipt.productionRestored, true); assert.equal(receipt.wrapperAbsent, true);
assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
const restoreArchive = async (record, limit) => {
  assert.match(record.path, /^outputs\/reports\/[A-Za-z0-9_.-]+\.json\.gz$/);
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: limit }); assert.equal(bytes.length, record.restoredBytes);
  assert.equal(sha(bytes), record.restoredSha256); return JSON.parse(bytes);
};
const raw = await restoreArchive(receipt.candidate.compressedReport, 33554432);
const executed = await restoreArchive(receipt.sourceArchive, 8388608);
assert.equal(receipt.candidate.rawRemovedAfterLosslessArchive, true);
assert.equal(sha(executed.generated), receipt.sourceArchive.driverSha256);
assert.equal(sha(executed.traceHelper), receipt.sourceArchive.traceHelperSha256);
assert.equal(Object.keys(executed.sourcePreimages).length, receipt.sourceArchive.preimageCount);
for (const [file, preimage] of Object.entries(executed.sourcePreimages)) {
  assert.equal(preimage.encoding, "base64"); assert.equal(sha(Buffer.from(preimage.data, "base64")), receipt.sourcePins[file]);
  assert.equal(sha(await read(file)), receipt.postSourcePins[file], file);
}
for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(hash, receipt.sourcePins[file], file);
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const buildBytes = await read("evidence/mpeg2-encoder-plane-build-38044000567.json"), build = JSON.parse(buildBytes);
assert.equal(sha(buildBytes), receipt.compiledBuildSha256); verifyEncoderPlaneBuildEvidence(build, branch);
assert.deepEqual(raw.manifest, build.manifest);
const previousBytes = await read(receipt.previousTerminal.path); assert.equal(sha(previousBytes), receipt.previousTerminal.sha256);
const previousReceipt = JSON.parse(previousBytes), previous = await restoreArchive(previousReceipt.sourceArchive, 8388608);
// The older immutable receipt stores restored byte/hash fields separately.
const previousRaw = await restoreArchive({ ...previousReceipt.candidate.compressedReport,
  restoredBytes: previousReceipt.candidate.rawReport.bytes,
  restoredSha256: previousReceipt.candidate.rawReport.sha256 }, 33554432);
assert.deepEqual(raw.source, previousRaw.source, "Same independently inspected full original, not a smaller substitute");
assert.equal(raw.browserVersion, previousRaw.browserVersion);
for (const field of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport"])
  assert.deepEqual(raw.progressProbe[field], previousRaw.progressProbe[field], field);
const expected = makeEncoderPlaneFullDriver(previous, root, receipt.wrapper, branch);
assert.equal(executed.generated, expected.generated);
const caller = makeEncoderPlaneFullCaller((await read("scripts/run-single-idle-original-full.mjs")).toString(), root);
assert.equal(executed.generatedCaller, caller.generated);
const facts = encoderPlaneTerminalFacts(raw);
const uiBuildBytes = await read(receipt.buildProof.path); assert.equal(sha(uiBuildBytes), receipt.buildProof.sha256);
const ui = JSON.parse(uiBuildBytes); assert.deepEqual(ui.asset, previous.expectedAsset);
assert.deepEqual(raw.progressProbe.actualServedAsset, ui.asset);
assert.equal(ui.stylesheet.sha256, previous.stylesheet.sha256);
assert.equal(raw.cssCandidate.interceptionError, null); assert.equal(raw.cssCandidate.staticAssets.length, 1);
const stylesheet = raw.cssCandidate.staticAssets[0], expectedStylesheet = previous.stylesheet;
assert.deepEqual({ url: new URL(stylesheet.url).pathname, bytes: stylesheet.beforeBytes, sha256: stylesheet.beforeSha256,
  afterBytes: stylesheet.afterBytes, afterSha256: stylesheet.afterSha256 },
{ url: expectedStylesheet.url, bytes: expectedStylesheet.bytes, sha256: expectedStylesheet.sha256,
  afterBytes: expectedStylesheet.afterBytes, afterSha256: expectedStylesheet.afterSha256 });
assert.equal(sha(raw.cssCandidate.css), expectedStylesheet.matrixCssSha256);
assert.deepEqual(raw.abortDiagnostic.stagedAdapters.map(({ bytes, sha256 }) => ({ bytes, sha256 })),
  Array(3).fill({ bytes: 18330, sha256: "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837" }));
assert.ok([0, 1].includes(receipt.candidate.actualExitCode));
assert.equal(raw.status, receipt.candidate.actualExitCode === 0 ? "passed-private-protected-session" : "failed");
assert.equal(facts.completedConversions, receipt.candidate.completedConversions);
for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(raw.cleanup[field], true, field);
assert.ok(!raw.cleanup.errors?.length);
for (const directory of [receipt.wrapper, raw.runtimeDirectory]) {
  assert.ok(path.relative(path.join(root, "work"), directory) && !path.relative(path.join(root, "work"), directory).startsWith(".."));
  await assert.rejects(access(directory), { code: "ENOENT" });
}
const identities = [...raw.nativeMemory.identities, ...raw.ownedLaunches.map(row => row.identity), receipt.driverIdentity];
assert.ok(identities.length > 0 && identities.length <= 128);
const pids = [...new Set(identities.map(row => { assert.ok(Number.isSafeInteger(row.pid) && row.pid > 0); return row.pid; }))];
const filter = pids.map(pid => `ProcessId = ${pid}`).join(" OR ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout); assert.ok(Array.isArray(current));
for (const row of [...identities, ...current]) assert.ok(Number.isFinite(Date.parse(row.createdAt)));
assert.ok(!current.some(now => identities.some(prior => now.pid === prior.pid && now.parentPid === prior.parentPid &&
  Math.abs(Date.parse(now.createdAt) - Date.parse(prior.createdAt)) <= 1)), "Actual owned birth identity is still alive");
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, raw.source.bytes);
const hash = createHash("sha256"); for await (const chunk of createReadStream(original)) hash.update(chunk);
assert.equal(hash.digest("hex"), raw.source.sha256);
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
for (const name of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"])
  assert.equal(sha(await read("dist/client/engines/remux/" + name)), sha(await read("public/engines/remux/" + name)));
for (const name of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
const analysisSourcePins = {};
for (const file of ["scripts/analyze-encoder-plane-full-terminal.mjs", "scripts/lib/encoder-plane-terminal-facts.mjs", "tests/mpeg2-encoder-plane-terminal.test.mjs"])
  analysisSourcePins[file] = sha(await read(file));
const result = { recordedAt: new Date().toISOString(), receipt: { path: receiptPath, sha256: sha(receiptBytes) }, ...facts,
  exactExecutedCallerAndDriverReconstructed: true, sourcePreimagesVerified: receipt.sourceArchive.preimageCount,
  actualRecordedIdentitiesRequeriedAndAbsent: true, reusedPids: current, noProcessesKilled: true,
  fullProtectedPostSha256Verified: true, normalProductionAndSixEnginesRestored: true, ninePrivateAssetsAbsent: true,
  ownedRuntimeAndWrapperAbsent: true, analysisSourcePins };
const output = receiptPath.replace(/\.json$/, "-analysis.json");
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: result.status, completedConversions: result.completedConversions,
  incrementalPrivateMiB: result.native.observedIncrementalPrivateMiB, publicAcceptance: false }));
