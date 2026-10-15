import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makePacketInterleaveCollector } from "./lib/packet-interleave-build-recipe.mjs";
assert.equal(process.argv.length, 3); assert.match(process.argv[2], /^[0-9]{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/collect-mpeg2-single-idle-build.mjs"), "utf8");
const recipe = makePacketInterleaveCollector(source, root);
const runtime = await createOwnedRuntimeScratch("packet-interleave-collector-");
try {
  const file = path.join(runtime.directory, "collector.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
