import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { makeVp9DurationBuildRecipe } from "../media/ffmpeg/vp9-duration-build-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root), "utf8");
const source = await read("media/ffmpeg/reproduce-nondocker.sh"), sha = value => createHash("sha256").update(value).digest("hex");
test("private duration build derivation is exact and reversible with no codec/compiler/memory changes", () => {
  const result = makeVp9DurationBuildRecipe(source); let forward = source;
  for (const [before, after] of result.edits) { assert.equal(forward.split(before).length, 2); forward = forward.replace(before, after); }
  assert.equal(forward, result.generated); assert.equal(sha(forward), result.generatedSha256);
  for (const [before, after] of result.edits.toReversed()) forward = forward.replace(after, before);
  assert.equal(forward, source); assert.equal(result.dependencyRecipesChanged, false); assert.equal(result.compilerSettingsChanged, false);
  assert.equal(result.memoryLimitsRaised, false); assert.equal(result.allCoreBuildSelected, false); assert.equal(result.publicAcceptance, false);
  assert.equal(result.boundedTransportRetriesChanged, true); assert.ok(result.generated.includes('--retry-all-errors --retry-delay 2 --retry-max-time 180 --connect-timeout 20 --max-time 120'));
  assert.ok(result.generated.includes('[[ "${WITHIN_BUILD_CORE_FILTER:-}" == "within-remux"'));
  assert.ok(result.generated.includes('restore_pre_theora_source\n  cp -- "${BUILD_ROOT}/within_remux.c"'));
});
test("generated shell parses without executing a compiler, conversion, download or cleanup", () => {
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "/bin/bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-n"], { input: makeVp9DurationBuildRecipe(source).generated,
    encoding: "utf8", windowsHide: true, timeout: 10000, maxBuffer: 65536 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});
test("private build retains original pinned downloads and actual finally cleanup/preflight", () => {
  const generated = makeVp9DurationBuildRecipe(source).generated;
  for (const anchor of ['sha256sum --check --strict', 'verify_specialist_source_rewrites', 'trap cleanup EXIT INT TERM',
    'MINIMUM_FREE_KIB', '"${WORK_ROOT}/vp9-duration-build"', '"${WORK_ROOT}/vp9-duration-output"',
    '[[ ! -e /src && ! -L /src ]]', '[[ ! -e /out && ! -L /out ]]', '"${BUILD_ROOT}/package.json"']) assert.ok(generated.includes(anchor), anchor);
  assert.equal(generated.includes('fail "Non-Docker FFmpeg artifacts differ from the published engine."'), false);
  assert.ok(generated.includes('Private VP9 duration candidate compiled; browser gates remain pending.'));
});
test("canonical native source, library configuration and linker stay pinned and untouched", async () => {
  const expected = { "media/ffmpeg/within_remux.c": "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068",
    "media/ffmpeg/build-libraries.sh": "6414ea37233cf82ebb4cbac2352061ed830befbdf7eb395988b7c1e2d187f6cf",
    "media/ffmpeg/build-remux.sh": "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e" };
  for (const [file, digest] of Object.entries(expected)) assert.equal(sha(await read(file)), digest);
});
test("dedicated workflow has pinned SDK, bounded retention, no broad native build and two cleanup steps", async () => {
  const workflow = await read(".github/workflows/vp9-duration-nondocker.yml");
  for (const anchor of ["224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f", "retention-days: 1", "contents: read",
    "build-vp9-duration-candidate.mjs", "Remove disposable owned build and SDK data", "Remove owned runtime scratch", "if: always()"])
    assert.ok(workflow.includes(anchor));
  assert.doesNotMatch(workflow, /(?:docker\s+(?:run|build)|WITHIN_BUILD_CORE_FILTER:\s*all|npm\s+install)/i);
});
test("actual temporary configure probe fails under inherited ESM but succeeds with the builder's CommonJS boundary", async () => {
  const runtime = await createOwnedRuntimeScratch("vp9-duration-probe-unit-");
  try {
    const file = runtime.directory + "/configure-probe.js";
    await writeFile(file, 'require("node:worker_threads");process.stdout.write("configure-probe-ok");\n', { flag: "wx" });
    const options = { cwd: runtime.directory, env: runtime.env, windowsHide: true, encoding: "utf8", timeout: 10000, maxBuffer: 65536 };
    const before = spawnSync(process.execPath, [file], options); assert.notEqual(before.status, 0);
    assert.match(before.stderr, /require is not defined in ES module scope/);
    await writeFile(runtime.directory + "/package.json", '{"type":"commonjs"}\n', { flag: "wx" });
    const after = spawnSync(process.execPath, [file], options); assert.equal(after.status, 0, after.stderr); assert.equal(after.stdout, "configure-probe-ok");
    const builder = await read("media/ffmpeg/build-vp9-duration-candidate.mjs");
    assert.ok(builder.includes('path.join(runtime.directory, "package.json")'));
  } finally { await runtime.close(); }
});
