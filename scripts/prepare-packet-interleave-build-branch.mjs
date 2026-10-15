import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makePacketInterleaveBranchCaller } from "./lib/packet-interleave-build-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/prepare-alignment16-build-branch.mjs"), "utf8");
const recipe = makePacketInterleaveBranchCaller(source, root);
const runtime = await createOwnedRuntimeScratch("packet-interleave-build-branch-");
try {
  const file = path.join(runtime.directory, "branch.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
