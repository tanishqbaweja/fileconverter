// Three fresh headless browser sessions, exactly12 real conversions each. This
// is small-fixture repeatability evidence, never large-file/public acceptance.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { auditVpxDecoderArtifact } from "./lib/vpx-decoder-artifact.mjs";
const root = path.resolve(import.meta.dirname, ".."), reports = path.join(root, "output/playwright");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const git = args => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 16384 }).trim();
const result = { scope: "private-small-fixture-same-and-fresh-session-repeatability", head: git(["rev-parse", "HEAD"]),
  ownSourceSha256: sha(await readFile(import.meta.filename)), sessions: [], allThreePassed: false,
  largeFileAcceptance: false, publicAcceptance: false, fullGoalComplete: false };
const runtime = await createOwnedRuntimeScratch("vpx-repeat-driver-");
const journal = path.join(reports, `vpx-repeat-sessions-${new Date().toISOString().replaceAll(":", "-")}.json`);
const outputHashes = new Map(), inputHashes = new Map(), browserIdentities = new Set();
try {
  const candidate = await auditVpxDecoderArtifact(process.env.WITHIN_VPX_CANDIDATE_DIRECTORY ?? path.join(root, "work/vpx-jspi-39710372299"));
  assert.equal(candidate.jspi, true); result.nativeManifestSha256 = candidate.manifestSha256;
  for (let session = 1; session <= 3; session++) {
    const before = new Set(await readdir(reports));
    const preload = pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href;
    const child = spawn(process.execPath, ["scripts/run-repository-owned-node.mjs", "node_modules/@playwright/test/cli.js", "test",
      "--config", "playwright.vpx.config.ts", "--grep", "same-session repeatability|complete same-instance", "--max-failures=1"],
    { cwd: root, windowsHide: true, stdio: "inherit", env: { ...runtime.env, WITHIN_TEST_VIDEO: "off",
      WITHIN_VPX_CANDIDATE_DIRECTORY: candidate.directory, WITHIN_VPX_REPEAT_QUALIFICATION: "1",
      WITHIN_VPX_ALLOCATION_DIAGNOSTIC: "1", WITHIN_VPX_DURING_ALLOCATOR_TRACE: "0", WITHIN_VPX_WASM_COMPILATION_TRACE: "0",
      NODE_OPTIONS: [runtime.env.NODE_OPTIONS ?? "", "--import=" + preload].filter(Boolean).join(" ") } });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) =>
      signal ? reject(new Error(`Owned repeat child exited with${signal}`)) : resolve(code)); });
    const added = (await readdir(reports)).filter(name => !before.has(name) && /^vpx-decoder-qualification-.*\.json$/.test(name));
    const receipt = { session, exitCode: code, reports: added, passed: false }; result.sessions.push(receipt);
    assert.equal(added.length, 1, "No split/restarted browser sessions may be relabelled as one coherent repeat");
    const bytes = await readFile(path.join(reports, added[0])), report = JSON.parse(bytes);
    Object.assign(receipt, { reportBytes: bytes.length, reportSha256: sha(bytes), incrementalPrivateMiB: report.primaryIncrementalPrivateMiB });
    assert.equal(code, 0); assert.equal(report.memoryAcceptance, true); assert.equal(report.inConversionDiagnosticOnly, false);
    assert.equal(report.executedSourcesAndBrowserPinsVerified, true); assert.equal(report.disposableDataRemoved, true);
    assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.repeatability.cases.length, 12);
    assert.equal(report.repeatCleanup.length, 12); assert.ok(report.repeatCleanup.every(row => row.deltaFromLoadedMiB <= 96));
    assert.deepEqual(report.staticCompilation, { coldCompiles: 1, reuses: 11 });
    assert.deepEqual(report.staticCodeRequests, { manifests: 12, wasm: 1 });
    const tests = report.rows.filter(row => row.test); assert.equal(tests.length, 13); assert.ok(tests.every(row => row.status === "passed"));
    const outputs = report.rows.filter(row => row.independentValidation), inputs = report.rows.filter(row => row.result?.type === "complete");
    assert.equal(outputs.length, 12); assert.equal(inputs.length, 12);
    const groups = new Map();
    for (let index = 0; index < outputs.length; index++) {
      const row = outputs[index], key = row.codec + ":" + JSON.stringify(row.options);
      const outputHash = row.independentValidation.outputSha256, inputHash = inputs[index].sourceSha256;
      if (outputHashes.has(key)) assert.equal(outputHashes.get(key), outputHash); else outputHashes.set(key, outputHash);
      if (inputHashes.has(key)) assert.equal(inputHashes.get(key), inputHash); else inputHashes.set(key, inputHash);
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    assert.equal(groups.size, 4); assert.ok([...groups.values()].every(count => count === 3));
    const browser = report.memorySamples.flatMap(sample => sample.processes ?? []).find(process => process.type === "browser");
    assert.ok(browser?.creationFileTime); const identity = `${browser.pid}:${browser.creationFileTime}`;
    assert.ok(!browserIdentities.has(identity)); browserIdentities.add(identity);
    Object.assign(receipt, { browserIdentity: identity, browserVersion: report.browserVersion,
      maximumCleanupDeltaFromLoadedMiB: Math.max(...report.repeatCleanup.map(row => row.deltaFromLoadedMiB)), passed: true });
    console.log(JSON.stringify({ repeatSession: receipt }));
  }
  assert.equal(git(["rev-parse", "HEAD"]), result.head); result.allThreePassed = true;
} catch (error) { result.failure = String(error).slice(0, 2048); process.exitCode = 1; }
finally {
  await runtime.close(); result.driverScratchRemoved = true;
  await mkdir(reports, { recursive: true }); await writeFile(journal, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ repeatJournal: path.relative(root, journal).replaceAll("\\", "/"), allThreePassed: result.allThreePassed, failure: result.failure ?? null }));
}
