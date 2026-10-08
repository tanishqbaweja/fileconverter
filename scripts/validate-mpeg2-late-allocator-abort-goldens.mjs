// Same executed five production conversions/validators, changed fatal observer only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname,".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/validate-mpeg2-late-abort-goldens.mjs", source = await readFile(path.join(root,sourcePath),"utf8");
const proof = JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-abort-goldens-2026-10-08.json")));
assert.equal(sha(source),proof.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, "..");',`const root = ${JSON.stringify(root)};`],
  ["mpeg2-late-abort-goldens", "mpeg2-late-allocator-abort-goldens"],
  ["stage-mpeg2-late-abort", "stage-mpeg2-late-allocator-abort"],
  ["mpeg2-late-abort-adapter", "mpeg2-late-allocator-abort-adapter"],
  ['"scripts/lib/late-pool-abort-capture.mjs",', '"scripts/lib/late-pool-abort-capture.mjs","scripts/lib/late-pool-allocator-abort-capture.mjs",\n  "scripts/lib/dlmalloc-free-header-inspection.mjs","scripts/lib/mpeg2-late-abort-adapter.mjs","scripts/stage-mpeg2-late-abort.mjs",'],
  ["mpeg2-late-goldens-", "mpeg2-late-allocator-goldens-"],
];
let generated = source;
for (const [before,after] of patches) { assert.ok(generated.includes(before),before); generated=generated.replaceAll(before,after); }
let reverse=generated;
for(const [before,after] of patches.toReversed()) reverse=reverse.replaceAll(after,before);
assert.equal(reverse,source,"Same production tests, full validators, host guard, source pins and finally cleanup");
generated=generated.replace(/from "(\.\/lib\/[^\"]+)"/g,
  (_match,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
const runtime=await createOwnedRuntimeScratch("mpeg2-late-allocator-goldens-wrapper-");
try {
  const target=path.join(runtime.directory,"goldens.mjs"); await writeFile(target,generated,{flag:"wx"});
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory),{code:"ENOENT"}); }
