// Exact previous stager derivative: no changed native core, I/O or restore path.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/stage-mpeg2-late-abort.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const proof = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-late-abort-goldens-2026-10-08.json")));
assert.equal(sha(source), proof.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, "..");', `const root = ${JSON.stringify(root)};`],
  ["mpeg2-late-abort-adapter.mjs", "mpeg2-late-allocator-abort-adapter.mjs"],
  ["makeLateAbortAdapter", "makeLateAllocatorAbortAdapter"],
  ['const { original, adapter } = makeLateAllocatorAbortAdapter({ stager,', `const { original, adapter } = makeLateAllocatorAbortAdapter({ stager,
  allocatorHelper: await readFile(path.join(root,"scripts/lib/late-pool-allocator-abort-capture.mjs"),"utf8"),
  freeHeaderHelper: await readFile(path.join(root,"scripts/lib/dlmalloc-free-header-inspection.mjs"),"utf8"),
  allocatorControlProof: JSON.parse(await readFile(path.join(root,"evidence/late-pool-allocator-abort-control-2026-10-08.json"))),
  layoutProof: JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json"))),`],
  ["mpeg2-late-abort-stager-", "mpeg2-late-allocator-abort-stager-"],
];
let generated = source;
for (const [before, after] of patches) {
  assert.equal(generated.split(before).length, before === "makeLateAbortAdapter" ? 3 : 2, before);
  generated = generated.replaceAll(before, after);
}
let reverse = generated;
for (const [before, after] of patches.toReversed()) reverse = reverse.replaceAll(after, before);
assert.equal(reverse, source, "Same exclusive creation, manifest verification, native core and restoration");
generated = generated.replace(/from "(\.\/lib\/[^\"]+)"/g,
  (_match, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-late-allocator-stager-wrapper-");
try {
  const target = path.join(runtime.directory,"stage.mjs"); await writeFile(target,generated,{flag:"wx"});
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory),{code:"ENOENT"}); }
