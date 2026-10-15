import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectExclusiveCopyComparison } from "./lib/exclusive-copy-comparison.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proofPath = "evidence/2026-10-15T16-05-01-937Z-exclusive-staged-copy-phased.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
const output = "evidence/2026-10-15T16-05-01-937Z-exclusive-staged-copy-independent-analysis.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
async function unpack(record, limit) {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: limit }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return JSON.parse(raw);
}
const native = await unpack(proof.nativeArchive, 8388608), sources = await unpack(proof.sourceArchive, 2097152);
const analysis = inspectExclusiveCopyComparison(proof, native); assert.deepEqual(sources.sourcePins, proof.sourcePins);
assert.equal(sha(sources.generatedWorker), proof.recipe.generatedSha256);
for (const [file, hash] of Object.entries(proof.sourcePins)) {
  assert.equal(sha(Buffer.from(sources.preimages[file], "base64")), hash, file); assert.equal(sha(await read(file)), hash, file);
}
const expected = createHash("sha256"), pattern = Buffer.alloc(65536);
for (let i = 0; i < pattern.length; i++) pattern[i] = (i * 31 + 17) & 255;
for (let at = 0; at < proof.fixtureBytes; at += pattern.length) expected.update(pattern.subarray(0, Math.min(pattern.length, proof.fixtureBytes - at)));
assert.equal(expected.digest("hex"), proof.fixtureSha256);
await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
const identities = [...native.identities, ...proof.identities.map(row => row.identity)];
const unique = [...new Map(identities.map(row => [`${row.pid}/${microsecondBirth(row.createdAt)}`, row])).values()];
const pids = [...new Set(unique.map(row => row.pid))]; assert.ok(pids.length > 5 && pids.length <= 64);
const command = "$ErrorActionPreference='Stop'; $copyAuditPids=" + pids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$copyAuditPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const runtime = await createOwnedRuntimeScratch("exclusive-copy-audit-"); let birthChecks;
try {
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
  const observed = JSON.parse(stdout); birthChecks = unique.map(identity => {
    const current = observed.find(row => row.pid === identity.pid) ?? null;
    assert.ok(!current || current.parentPid !== identity.parentPid || microsecondBirth(current.createdAt) !== microsecondBirth(identity.createdAt));
    return { identity, current, ownedBirthAbsent: true };
  });
} finally { await runtime.close(); }
assertInstalledChromePinsEqual(proof.browserPin, proof.browserPinAfter); const pin = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(pin, proof.browserPin);
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const hash = createHash("sha256"); for await (const bytes of createReadStream(original, { highWaterMark: 1048576 })) hash.update(bytes);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const ownSources = {};
for (const file of ["scripts/analyze-exclusive-staged-copy.mjs", "scripts/lib/exclusive-copy-comparison.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const result = { recordedAt: new Date().toISOString(), ...analysis, proof: { path: proofPath, sha256: sha(proofBytes) },
  sourceArchive: proof.sourceArchive, nativeArchive: proof.nativeArchive, all23PreCurrentPostSourcesVerified: true,
  protectedOriginalBytes: 2958573265, protectedOriginalSha256: originalSha256, browserPin: pin,
  birthChecks, allDiagnosticDataAndProfileRemoved: true, noProcessesKilledByAudit: true, ownSources };
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: result.status, baselineMedianMs: result.baselineMedianMs, candidateMedianMs: result.candidateMedianMs,
  baselinePeakPrivateMiB: result.baselinePeakPrivateMiB, candidatePeakPrivateMiB: result.candidatePeakPrivateMiB, ownedBirthsAbsent: birthChecks.length }));
