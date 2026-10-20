import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("controlled unavailable-private-artifact probe fails all four static prerequisites without changing real files", async () => {
  const child = spawn(process.execPath, ["scripts/probe-private-artifact-portability.mjs"],
    { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", value => { stdout += value; assert.ok(stdout.length <= 32768); });
  child.stderr.on("data", value => { stderr += value; assert.ok(stderr.length <= 32768); });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(code, 0, stderr); const value = JSON.parse(stdout);
  assert.equal(value.expectedFailedTests, 4); assert.equal(value.command.exit.code, 1);
  assert.equal(value.sourceTestUnmodified, true); assert.equal(value.filesRemovedRenamedOrOverwritten, false);
  assert.equal(value.conversionsPerformed, 0); assert.equal(value.publicAcceptance, false);
  assert.equal(value.retainedBytesPerPipeLimit, 65536);
  assert.equal(value.status,"verified-explicit-private-native-prerequisites-fail-without-owned-artifacts");
  assert.equal(value.command.args.at(-1),"tests/private-native-prerequisites.test.mjs");
  assert.ok(value.privatePaths.length > 0 && value.privatePaths.every(file => /work[\\/]mpeg2-(?:jspi|lto)-/.test(file) && !file.includes("{ code:")));
});
test("diagnostic hook is not wired into production, build or the default test command", async () => {
  const packageJson = JSON.parse(await readFile("package.json"));
  assert.ok(!Object.values(packageJson.scripts).some(command => command.includes("ci-without-private-work")));
  const hook = await readFile("scripts/lib/ci-without-private-work.mjs", "utf8");
  assert.ok(hook.includes("Diagnostic subprocess ONLY")); assert.ok(hook.includes('code: "ENOENT"'));
  for (const file of [".github/workflows/ci.yml", "scripts/run-jspi-ssim-full.mjs", "scripts/qualify-lto-browser.mjs"])
    assert.ok(!(await readFile(file, "utf8")).includes("ci-without-private-work"), file);
});
