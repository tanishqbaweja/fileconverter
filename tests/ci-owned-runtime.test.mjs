import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import { prepareCiRuntime, cleanupCiRuntime } from "../scripts/ci-owned-runtime.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

const job = { GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", GITHUB_JOB: "verify", GITHUB_SHA: "a".repeat(40) };

test("CI runtime scopes browser profiles, tools and caches inside a short fresh owned directory and cleans them", async () => {
  const fixture = await createOwnedRuntimeScratch("ci-runtime-test-"); let value;
  try {
    const file = path.join(fixture.directory, "github-env"); await writeFile(file, "");
    value = await prepareCiRuntime({ ...job, GITHUB_ENV: file });
    assert.match(path.basename(value.directory), /^ci-[a-zA-Z0-9]{6}$/);
    assert.equal(value.env.TEMP, value.directory); assert.equal(value.env.TMP, value.directory);
    assert.equal(value.env.TMPDIR, value.directory);
    for (const key of ["PLAYWRIGHT_BROWSERS_PATH", "npm_config_cache", "PIP_CACHE_DIR", "XDG_CACHE_HOME", "WRANGLER_LOG_PATH", "NODE_COMPILE_CACHE"])
      assert.equal(path.dirname(value.env[key]), value.directory);
    const exported = Object.fromEntries((await readFile(file, "utf8")).trim().split("\n").map(line => {
      const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)];
    }));
    assert.deepEqual(exported, value.env);
    await writeFile(path.join(value.directory, "disposable-profile-data"), "owned only");
    const result = await cleanupCiRuntime({ ...job, ...exported, GITHUB_ENV: file });
    assert.equal(result.status, "owned-runtime-removed"); assert.equal(result.noProcessesKilled, true);
    assert.match(await readFile(file, "utf8"), /\nNODE_DISABLE_COMPILE_CACHE=1\n$/);
    // Simulate the subsequent GitHub Node action with the propagated job env.
    await promisify(execFile)(process.execPath, ["-e", "1+1"], { windowsHide: true,
      env: { ...process.env, ...exported, NODE_DISABLE_COMPILE_CACHE: "1" }, maxBuffer: 16384 });
    await assert.rejects(access(value.directory), { code: "ENOENT" }); value = null;
  } finally {
    if (value) await cleanupCiRuntime({ ...job, ...value.env });
    await fixture.close();
  }
});

test("CI cleanup refuses another job, modified birth identity and broad targets instead of sweeping", async () => {
  const fixture = await createOwnedRuntimeScratch("ci-runtime-guard-"); let value, original;
  try {
    const file = path.join(fixture.directory, "github-env"); await writeFile(file, "");
    value = await prepareCiRuntime({ ...job, GITHUB_ENV: file });
    const env = { ...job, ...value.env }, owner = value.env.WITHIN_CI_RUNTIME_OWNER;
    original = await readFile(owner, "utf8");
    await assert.rejects(cleanupCiRuntime({ ...env, GITHUB_RUN_ID: "456" }), /different job/);
    const record = JSON.parse(original); record.ino = "invalid"; await writeFile(owner, JSON.stringify(record));
    await assert.rejects(cleanupCiRuntime(env)); await access(value.directory);
    await assert.rejects(cleanupCiRuntime({ ...env, WITHIN_CI_RUNTIME_OWNER: path.resolve("work", "ci-runtime-owner.json") }));
    await assert.rejects(cleanupCiRuntime({ ...env, WITHIN_CI_RUNTIME_OWNER: path.resolve("test.mkv") }));
    assert.equal((await cleanupCiRuntime(job)).status, "not-created");
  } finally {
    if (value) { if (original) await writeFile(value.env.WITHIN_CI_RUNTIME_OWNER, original); await cleanupCiRuntime({ ...job, ...value.env }); }
    await fixture.close();
  }
});
