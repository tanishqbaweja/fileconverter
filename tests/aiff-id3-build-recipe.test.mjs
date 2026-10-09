import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import yaml from "js-yaml";
import { makeAiffId3BuildRecipe } from "../media/ffmpeg/aiff-id3-build-recipe.mjs";
import { makeAiffId3BuildWorkflow } from "../scripts/lib/aiff-id3-build-workflow.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const parse = yaml.load;
const base = await read("media/ffmpeg/reproduce-nondocker.sh"), recipe = makeAiffId3BuildRecipe(base);
test("Private AIFF recipe reverses exactly, never claims comparison to a deliberately different published binary", () => {
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, base); assert.equal(recipe.publicAcceptance, false);
  for (const token of ["ffmpeg-${FFMPEG_VERSION}.tar.xz", "sha256sum --check --strict", "verify_specialist_source_rewrites", "trap cleanup EXIT INT TERM",
    "Refusing to replace existing /src", "Refusing to replace existing /out", "MINIMUM_FREE_KIB", "within-aiff ./build-remux.sh", "make-aiff-id3-specialist.mjs"])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(!recipe.generated.includes("comparison_files=()"));
  assert.ok(!recipe.generated.includes("Exact non-Docker FFmpeg artifact comparison passed"));
  assert.throws(() => makeAiffId3BuildRecipe(base + "\n"));
});
test("Isolated registered AIFF workflow adds only candidate build/upload, keeping SDK/disk/always cleanup and normal default intact", async () => {
  const source = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"), generated = makeAiffId3BuildWorkflow(source);
  const old = parse(source), next = parse(generated);
  assert.ok(Object.hasOwn(next, "on"));
  assert.ok(next.on.workflow_dispatch.inputs.core.options.includes("within-aiff"));
  assert.deepEqual(next.on, old.on); assert.deepEqual(next.permissions, old.permissions); assert.deepEqual(next.concurrency, old.concurrency);
  const oldSteps = old.jobs["reproduce-ffmpeg"].steps, steps = next.jobs["reproduce-ffmpeg"].steps;
  assert.equal(steps.length, oldSteps.length + 1);
  for (const row of oldSteps.filter(row => row.name !== "Rebuild and compare requested FFmpeg module(s)"))
    assert.deepEqual(steps.find(step => step.name === row.name), row);
  const upload = steps.find(row => row.name === "Retain private metadata-only AIFF specialist");
  assert.equal(upload.if, "success() && inputs.core == 'within-aiff'"); assert.equal(upload.with["retention-days"], 1);
  assert.equal(upload.with.path, "work/ffmpeg-nondocker-output/");
  assert.ok(generated.includes("node media/ffmpeg/build-aiff-id3-specialist.mjs"));
  assert.throws(() => makeAiffId3BuildWorkflow(source + "\n"));
});
test("Generated private shell parses without compiling or touching any build/output directory", () => {
  let bash = "bash";
  if (process.platform === "win32") {
    const git = spawnSync("git", ["--exec-path"], { encoding: "utf8", windowsHide: true });
    assert.equal(git.status, 0, git.stderr);
    bash = path.join(path.resolve(git.stdout.trim(), "../../.."), "bin/bash.exe");
  }
  const checked = spawnSync(bash, ["-n"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
});
test("Native builder is Linux-only/private, verifies actual compiled source reversal/16-32 MiB memory, and never touches browser or fixture", async () => {
  const builder = await read("media/ffmpeg/build-aiff-id3-specialist.mjs");
  for (const token of ['process.platform, "linux"', "AIFF_BASE_LINK_SHA", "AIFF_ID3_SPECIALIST_EDITS.toReversed()", "PUBLISHED_AIFF_SOURCE_SHA256",
    "initialPages: 256, maximumPages: 512", "windowsHide: true", "await runtime.close()", "reproductionOfPublishedBinaryAttempted: false", "publicAcceptance: false"])
    assert.ok(builder.includes(token), token);
  for (const token of ["test.mkv", "chromium.launch", "ffmpeg.exe", 'writeFile(path.join(root, "public', "child.kill"]) assert.ok(!builder.includes(token));
});
test("Branch helper uses an isolated index, guards protected fixture/main/canonical HEAD and refuses an existing branch", async () => {
  const helper = await read("scripts/prepare-aiff-id3-build-branch.mjs");
  for (const token of ["GIT_INDEX_FILE", "GIT_TERMINAL_PROMPT", "GCM_INTERACTIVE", '"ls-files", "--", "test.mkv"',
    '"refs/heads/main"', '"0".repeat(40)', "Never overwrite remote branch", '"status", "--porcelain"',
    "canonicalHeadIndexAndWorkflowUnchanged", "await runtime.close()", "actualBuildStarted: false"])
    assert.ok(helper.includes(token), token);
  for (const token of ["checkout", "reset", "copyFile(", "child.kill"]) {
    if (token === "checkout") continue; // Descriptive comment/report states NO checkout.
    assert.ok(!helper.includes(token));
  }
  assert.ok(!helper.includes('["checkout"'));
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: helper, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
});
