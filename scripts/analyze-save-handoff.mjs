import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectSaveHandoffObservation } from "./lib/save-handoff-observation.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamps = ["2026-10-17T03-01-12-135Z", "2026-10-17T03-13-05-207Z"], records = [], births = [];
const media = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
const unpack = async (record, maximum = 33554432) => {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: maximum });
  assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw;
};
for (const [index, stamp] of stamps.entries()) {
  const file = `evidence/${stamp}-save-handoff-control-terminal.json`, bytes = await read(file), terminal = JSON.parse(bytes);
  const report = JSON.parse(await unpack(terminal.report)), analysis = inspectSaveHandoffObservation(terminal, report, index === 1);
  assert.deepEqual(terminal.sourcePins, terminal.postSourcePins); assert.deepEqual(report.sourceHashes, terminal.sourcePins);
  assert.equal(Object.keys(terminal.sourcePins).length, 775);
  const sources = JSON.parse(await unpack(terminal.sourceArchive)), evolvedDiagnosticFiles = [];
  assert.deepEqual(sources.pins, terminal.sourcePins);
  for (const [name, digest] of Object.entries(sources.pins)) {
    const entry = sources.extensionPreimages[name];
    if (entry?.encoding === "base64") assert.equal(sha(Buffer.from(entry.data, "base64")), digest);
    else if (entry) {
      assert.equal(entry.encoding, "qualified-external"); assert.equal(entry.path, name);
      const external = await read(name); assert.equal(external.length, entry.bytes);
      assert.equal(sha(external), entry.sha256); assert.equal(entry.sha256, digest);
    }
    if (sha(await read(name)) !== digest) {
      assert.equal(index, 0);
      assert.ok(["scripts/lib/completed-save-control.mjs", "tests/save-handoff-control.test.mjs"].includes(name));
      assert.ok(entry); evolvedDiagnosticFiles.push(name);
    }
  }
  // Independently reconstruct the ACTUALLY executed generated helper from each
  // retained generator preimage, including its one picker-only difference.
  const preimage = Buffer.from(sources.extensionPreimages["scripts/lib/completed-save-control.mjs"].data, "base64").toString();
  const relocated = preimage.replace(/from "(\.[^"\r\n]+)"/g, (_, name) =>
    `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", name)).href)}`)
    .replace('from "esbuild"', `from ${JSON.stringify(pathToFileURL(path.join(root, "node_modules/esbuild/lib/main.js")).href)}`);
  const generator = await import("data:text/javascript;base64," + Buffer.from(relocated).toString("base64"));
  const recipe = generator.deriveCompletedSaveModule(media.recipe.generated.spec, root);
  const generated = (await transform(recipe.source, { loader: "ts", format: "esm", target: "es2022" })).code;
  const provenance = report.progressProbe.successfulSaveControl.provenance;
  assert.equal(provenance.esbuildVersion, esbuildVersion);
  assert.equal(sha(generated), provenance.generatedJavascriptSha256);
  assert.equal((await unpack(provenance.archive)).toString(), generated);
  if (index === 1) {
    assert.equal(provenance.validatorEdits.length, 1);
    assert.equal(provenance.originalValidatorSha256, records[0].provenance.validatorSha256);
  }
  assert.ok(sources.traceHelper.includes(stamp));
  const trace = report.rendererAttributionResult.sessions[0].trace.trace;
  const tracePath = path.relative(root, trace.rawArchive.path).replaceAll(path.sep, "/");
  assert.ok(tracePath.startsWith("outputs/reports/") && !tracePath.includes(".."));
  const traceZip = await read(tracePath); assert.equal(sha(traceZip), trace.rawArchive.sha256);
  const traceRaw = gunzipSync(traceZip, { maxOutputLength: 16777216 });
  assert.equal(traceRaw.length, trace.serializedBytes); assert.equal(sha(traceRaw), trace.sha256);
  const checkpoint = report.nativeMemory.durableCheckpoint.file;
  assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports"));
  const checkpointBytes = await readFile(checkpoint), zipped = gzipSync(checkpointBytes, { level: 9 });
  assert.deepEqual(JSON.parse(checkpointBytes).native.identities, report.nativeMemory.identities);
  await writeFile(checkpoint + ".gz", zipped, { flag: "wx" });
  assert.deepEqual(gunzipSync(await readFile(checkpoint + ".gz")), checkpointBytes);
  await rm(checkpoint);
  for (const directory of [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory,
    report.runtimeDirectory, report.cleanup.completedSaveFixture.fixtureDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  births.push(...terminal.treeCleanupAudit.recordedBirths);
  records.push({ terminal: { path: file, sha256: sha(bytes) }, sourceArchive: terminal.sourceArchive, report: terminal.report,
    sourceCount: 775, executedPrePostPinsEqual: true, evolvedDiagnosticFiles, analysis, provenance,
    trace: { path: tracePath, bytes: traceZip.length, sha256: sha(traceZip), capturedAfterProductionCancellation: true },
    checkpoint: { path: path.relative(root, checkpoint + ".gz").replaceAll(path.sep, "/"), bytes: zipped.length,
      sha256: sha(zipped), restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes), redundantRawRemoved: true } });
}
const bundlePath = "node_modules/playwright-core/lib/coreBundle.js", bundle = (await read(bundlePath)).toString();
const excerpt = (begin, end, start = 0) => {
  const first = bundle.indexOf(begin, start), last = bundle.indexOf(end, first);
  assert.ok(first >= 0 && last > first && last - first < 8192); return { start: first, end: last, source: bundle.slice(first, last) };
};
const upload = excerpt("async function prepareFilesForUpload", "var import_fs13");
const reconstruction = excerpt("  setInputFiles(node, payloads)", "  expectHitTarget(");
const connectOffset = bundle.indexOf("async _connectOverCDPImpl");
const remote = excerpt("if (!options.isLocal)", "browser.on(Browser.Events.Disconnected", connectOffset);
assert.ok(upload.source.includes('payload.buffer.toString("base64")'));
assert.ok(reconstruction.source.includes("Uint8Array.from(atob(file.buffer)"));
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const current = JSON.parse(stdout), checkedBirths = births.map(identity => {
  const live = current.find(row => row.pid === identity.pid);
  assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, status: live ? "owned-birth-absent-reused-pid-no-action" : "owned-birth-absent" };
});
const original = path.join(root, "test.mkv"), originalStat = await lstat(original);
assert.equal(originalStat.size, 2958573265); assert.ok(originalStat.isFile() && !originalStat.isSymbolicLink());
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
const ownSources = {};
for (const file of ["scripts/analyze-save-handoff.mjs", "scripts/lib/save-handoff-observation.mjs", "tests/save-handoff-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const receipt = { recordedAt: new Date().toISOString(), status: "test-input-materialization-corrected-bounded-original-memory-reproducer-observed-not-acceptance",
  records, checkedBirths, original: { bytes: originalStat.size, sha256: originalSha256 }, ownSources,
  playwrightInputMechanism: { packageVersion: JSON.parse(await read("node_modules/playwright-core/package.json")).version,
    source: { path: bundlePath, sha256: sha(bundle) }, excerpts: { upload, reconstruction, remote },
    exactPeakObjectOrCallsiteProven: false, oldOriginalFullDriverAlreadyUsesNativeDiskPicker: true },
  nextAction: "Use this bounded successful-save/original-startup reproducer for allocation instrumentation and candidate comparison. Native/compiled-Wasm lifetime is a hypothesis, not a proved cause. No unchanged three-hour retry; no public/full-original acceptance.",
  publicAcceptance: false, fullOriginalAcceptance: false };
const output = "evidence/2026-10-17-save-handoff-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, cases: records.map(row => ({ fixtureValidated: row.analysis.successfulFixtureValidations, breachMiB: row.analysis.firstBudgetFailureMiB })), checkedBirths: checkedBirths.length, originalSha256 }));
