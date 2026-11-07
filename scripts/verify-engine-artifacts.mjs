import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { verifyEngineArtifactTrees } from "./lib/verify-engine-artifact-trees.mjs";
const [expectedCommit, id, mode] = process.argv.slice(2), root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 5); assert.match(expectedCommit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
assert.ok(["published", "rebuilt", "package-copy"].includes(mode)); assert.match(id, /^[a-z0-9-]+$/);
assert.ok(id !== "all" || mode === "published");
const { stdout } = await execute(process.execPath, ["scripts/engine-reproducibility-manifest.mjs", "--non-docker"], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const matrix = JSON.parse(stdout).include, engines = id === "all" ? matrix : matrix.filter(e => e.id === id);
assert.equal(engines.length, id === "all" ? matrix.length : 1); assert.ok(engines.length > 0 && engines.length <= 64);
const publishedRoot = path.join(root, "public", "engines"), expectedRoots = new Set(matrix.map(e => path.basename(e.output)));
assert.equal(await realpath(publishedRoot), publishedRoot); assert.equal(expectedRoots.size, matrix.length);
for await (const entry of await opendir(publishedRoot)) {
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink() && expectedRoots.delete(entry.name), "Unexpected published engine entry: " + entry.name);
}
assert.equal(expectedRoots.size, 0, "Missing published engine directory");
for (const engine of engines) {
  if (mode === "package-copy") {
    assert.equal(engine.id, "svg"); assert.equal(engine.reproductionKind, "pinned-package-copy");
    const scratch = await createOwnedRuntimeScratch("engine-package-copy-"); let result;
    try {
      const output = path.join(scratch.directory, "svg");
      await execute(process.execPath, ["scripts/build-svg-engine.mjs", "--owned-output", output], { cwd: root, env: scratch.env, windowsHide: true, timeout: 20000, maxBuffer: 131072 });
      result = await verifyEngineArtifactTrees({ root, expectedCommit, engine, rebuiltDirectory: path.relative(root, output).replaceAll("\\", "/") });
    } finally { await scratch.close(); }
    console.log(JSON.stringify({ ...result, mode, pinnedPackageCopyExecuted: true, sourceCompilationExecuted: false, scratchRemoved: true }));
  } else {
    if (mode === "rebuilt") assert.equal(engine.reproductionKind, "native-source");
    const rebuiltDirectory = mode === "rebuilt" ? `work/${engine.id === "ffmpeg-remux" ? "ffmpeg" : path.basename(engine.output)}-nondocker-output` : null;
    console.log(JSON.stringify({ ...await verifyEngineArtifactTrees({ root, expectedCommit, engine, rebuiltDirectory }), mode }));
  }
}
