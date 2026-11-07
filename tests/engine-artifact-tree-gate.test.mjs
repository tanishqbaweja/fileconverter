import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { verifyEngineArtifactTrees } from "../scripts/lib/verify-engine-artifact-trees.mjs";
const execute = promisify(execFile), git = process.env.WITHIN_GIT_EXECUTABLE ?? "git";
const parse = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml").load;
const engine = { id: "bzip2", output: "public/engines/bzip2", reproductionKind: "native-source" };
const rebuiltDirectory = "work/bzip2-nondocker-output", binary = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
async function fixture(work) {
  const scratch = await createOwnedRuntimeScratch("artifact-tree-unit-");
  try {
    const root = scratch.directory, published = path.join(root, engine.output), rebuilt = path.join(root, rebuiltDirectory);
    const gitCommand = async args => (await execute(git, ["-c", "core.autocrlf=false", ...args],
      { cwd: root, env: scratch.env, windowsHide: true, timeout: 15000, maxBuffer: 32768 })).stdout;
    await mkdir(published, { recursive: true }); await mkdir(rebuilt, { recursive: true });
    for (const directory of [published, rebuilt]) {
      await writeFile(path.join(directory, "core.wasm"), binary, { flag: "wx" });
      await writeFile(path.join(directory, "LICENSE"), "test license\n", { flag: "wx" });
    }
    await writeFile(path.join(root, ".gitignore"), "ghost.wasm\nwork/\n", { flag: "wx" });
    await gitCommand(["init", "--object-format=sha1", "--quiet"]);
    await gitCommand(["add", "--", ".gitignore", "public/engines"]);
    await gitCommand(["-c", "user.name=Fixture", "-c", "user.email=fixture@invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Fixture"]);
    const expectedCommit = (await gitCommand(["rev-parse", "HEAD"])).trim();
    await work({ published, rebuilt, gitCommand, options: { root, expectedCommit, engine, rebuiltDirectory, git } });
  } finally { await scratch.close(); }
}
test("independent verifier checks all raw Git blob bytes, including license files, without claiming compilation", async () => {
  await fixture(async ({ options }) => {
    const r = await verifyEngineArtifactTrees(options); assert.equal(r.files, 2); assert.equal(r.wasmFiles, 1);
    assert.equal(r.publishedTreeMatchesCommit, true); assert.equal(r.rebuiltTreeMatchesCommit, true);
    assert.equal(r.sourceCompilationProvenByComparator, false);
    const published = await verifyEngineArtifactTrees({ ...options, rebuiltDirectory: null });
    assert.equal(published.rebuiltTreeMatchesCommit, false); assert.equal(r.treeSha256, published.treeSha256);
  });
});
test("old git diff green for ignored extra files and a missing fresh tree; new CI comparator fails closed", async () => {
  await fixture(async ({ options, published, rebuilt, gitCommand }) => {
    const ignored = path.join(published, "ghost.wasm"); await writeFile(ignored, binary, { flag: "wx" });
    assert.equal(await gitCommand(["diff", "--exit-code", "--", engine.output]), "");
    await assert.rejects(verifyEngineArtifactTrees(options), /Unexpected.*ghost\.wasm/);
    await unlink(ignored);
    await assert.rejects(verifyEngineArtifactTrees({ ...options, rebuiltDirectory: "work/no-new-output" }), { code: "ENOENT" });
    await writeFile(path.join(rebuilt, "ghost.wasm"), binary, { flag: "wx" });
    await assert.rejects(verifyEngineArtifactTrees(options), /Unexpected.*ghost\.wasm/);
  });
});
test("same-length byte drift, missing LICENSE and wrong commit are rejected even if another tree matches", async () => {
  await fixture(async ({ options, rebuilt }) => {
    const binaryPath = path.join(rebuilt, "core.wasm"); await writeFile(binaryPath, Buffer.from([0, 97, 115, 109, 2, 0, 0, 0]));
    await assert.rejects(verifyEngineArtifactTrees(options), /SHA-256 differs/);
    await writeFile(binaryPath, binary); await unlink(path.join(rebuilt, "LICENSE"));
    await assert.rejects(verifyEngineArtifactTrees(options), /Missing artifact files/);
    await assert.rejects(verifyEngineArtifactTrees({ ...options, expectedCommit: "0".repeat(40) }), /not checked out HEAD/);
  });
});
test("redirected, outside-work and extra empty directory outputs fail before accepting data", async () => {
  await fixture(async ({ options, published, rebuilt }) => {
    await assert.rejects(verifyEngineArtifactTrees({ ...options, rebuiltDirectory: engine.output }), /separate repository work/);
    await assert.rejects(verifyEngineArtifactTrees({ ...options, rebuiltDirectory: "work/../../outside" }), /Safe portable/);
    await symlink(published, path.join(options.root, "work", "redirect"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(verifyEngineArtifactTrees({ ...options, rebuiltDirectory: "work/redirect" }), /cannot redirect/);
    await mkdir(path.join(rebuilt, "empty")); await assert.rejects(verifyEngineArtifactTrees(options), /Unexpected artifact directory/);
  });
});
test("CI compares actual fresh native trees and isolated SVG package copy under separate labels", async () => {
  const workflow = parse(await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs["reproduce-engines"].steps;
  const index = text => steps.findIndex(s => s.name?.includes(text));
  const build = index("Rebuild pinned engine"), compare = index("Compare fresh native output"), copy = index("isolated pinned SVG package copy");
  assert.ok(build >= 0 && compare > build && copy > compare);
  assert.match(steps[build].if, /native-source/); assert.equal(steps[build].env.WITHIN_KEEP_NONDOCKER_OUTPUT, "1");
  assert.match(steps[compare].if, /native-source/); assert.match(steps[compare].run, /verify-engine-artifacts\.mjs.* rebuilt/);
  assert.match(steps[copy].if, /pinned-package-copy/); assert.match(steps[copy].run, /verify-engine-artifacts\.mjs.* package-copy/);
  assert.ok(index("Confirm published tracked artifacts") > copy);
});
