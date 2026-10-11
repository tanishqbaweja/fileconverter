import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
test("full caller is syntactically valid and preserves headless/source/archive/terminal/ownership gates (static only, not a conversion)", async () => {
  const file = path.join(root, "scripts/run-allocation-attempt-original-full.mjs"), source = await readFile(file, "utf8");
  const checked = spawnSync(process.execPath, ["--check", file], { windowsHide: true, encoding: "utf8", timeout: 5000 }); assert.equal(checked.status, 0, checked.stderr);
  for (const token of ['process.argv[2] === "--prepare-only"', "await protectedSource()", "assert.deepEqual(proof.protectedAfter, proof.protectedBefore)",
    "32 * 1024 ** 3", "proof.hostPreflight.safeToStart", "proof.launchHostPreflight.safeToStart", "await verifyAttemptPlaneCandidate",
    "await writeLayeredFullSourceArchive", "await materializeLayeredFullSourceArchive", 'generatedCaller: await readFile(import.meta.filename, "utf8")',
    "WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: candidateName", 'windowsHide: true, stdio: "inherit"', "await done", 'const code = await done',
    'if (!prepareOnly)', 'requestedRuns: 3', "maximumConversionMsPerRun: 21600000", "primaryLimitMiB: 250",
    "assert.deepEqual(raw.sourceHashes, snapshot.pins)", "assert.equal(raw.abortDiagnostic.captureError, null)", "validateCompositeAllocationFailureRecord(row)",
    "assert.equal(proof.candidate.completedConversions, 3)", "if (code === 0)", "await finishOwnedCleanup(actions)", "await candidateRuntime.close()",
    "await runtime.close()", '"owned-identity-absent"', "wholeFileReadOnly: true"])
    assert.ok(source.includes(token), token);
  assert.ok(!source.includes("--prepare-only\" ||")); assert.ok(!source.includes("kill(")); assert.ok(!source.includes("taskkill"));
  assert.ok(source.indexOf("const code = await done") < source.indexOf("await candidateRuntime.close()"));
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
    assert.ok((await readFile(path.resolve(path.dirname(file), match[1]))).length > 0, match[1]);
});
test("full caller refuses unsupported invocation BEFORE reading protected media or creating runtime directories", () => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/run-allocation-attempt-original-full.mjs"), "--unsupported"], { windowsHide: true, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.ok(result.stderr.includes("process.argv.length === 2"));
  assert.ok(!result.stdout.includes("driverIdentity")); assert.ok(!result.stdout.includes("wrapperAbsent"));
});
