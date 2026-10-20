// Controlled read-only negative probe, NOT a hosted CI result or test exemption.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { boundedTail } from "./lib/bounded-supervisor-journal.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), testFile = "tests/private-native-prerequisites.test.mjs";
assert.equal(process.argv.length, 2);
const command = ["--import", "./scripts/lib/ci-without-private-work.mjs", "--test", "--test-concurrency=1", testFile];
const stdout = boundedTail(), stderr = boundedTail();
// Launch a real new test runner even if this probe itself is under node:test.
const probeEnvironment = { ...process.env }; delete probeEnvironment.NODE_TEST_CONTEXT;
const child = spawn(process.execPath, command, { cwd: root, env: probeEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", bytes => stdout.append(bytes)); child.stderr.on("data", bytes => stderr.append(bytes));
const exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
const combined = [stdout, stderr].map(tail => Buffer.from(tail.snapshot().tailBase64, "base64").toString()).join("\n");
assert.equal(exit.code, 1, "The actual private test must fail when its untracked artifacts are absent");
assert.ok(combined.includes("CI_PRIVATE_WORK_PROBE") && combined.includes("ENOENT"));
assert.ok(/work[\\/]mpeg2-(?:lto|jspi)-/.test(combined));
assert.ok(/fail\s+4/.test(combined), "All four actual static native prerequisite checks must fail when artifacts are unavailable");
const privatePaths = [...new Set([...combined.matchAll(/CI_PRIVATE_WORK_PROBE: untracked private artifact absent: ([^\r\n]+)/g)]
  .map(match => match[1].split("] { code:")[0].replace(/['"\s]+$/, "")))].slice(0, 8);
const sources = {};
for (const file of ["scripts/probe-private-artifact-portability.mjs", "scripts/lib/ci-without-private-work.mjs", testFile,
  "package.json", ".github/workflows/ci.yml"]) {
  const value = await readFile(path.join(root, file)); sources[file] = { bytes: value.length, sha256: sha(value) };
}
console.log(JSON.stringify({ status: "verified-explicit-private-native-prerequisites-fail-without-owned-artifacts",
  command: { executable: process.execPath, args: command, windowsHide: true, exit }, sources, privatePaths,
  expectedFailedTests: 4, sourceTestUnmodified: true, filesRemovedRenamedOrOverwritten: false, conversionsPerformed: 0,
  limitation: "Static artifact availability/integrity only, not full source-bound route qualification or a standalone hosted CI result. Original LTO control assertions remain unchanged in the explicit qualification suite.",
  qualificationConstraint: "Portable units do not select these prerequisite-bound tests. Missing files fail explicit qualification; no failure or missing input becomes passed coverage.",
  retainedBytesPerPipeLimit: 65536, stdoutTotalBytes: stdout.snapshot().totalBytes, stderrTotalBytes: stderr.snapshot().totalBytes,
  publicAcceptance: false }));
