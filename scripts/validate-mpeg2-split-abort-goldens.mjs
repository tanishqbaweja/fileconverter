// Changed real-browser prerequisite for the served failure hook. Small fixtures
// only; cannot stand in for full-source/250MiB/repeat/quality acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root,"scripts/validate-mpeg2-split-direct.mjs"),"utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "b4cb70a6977f664337e6c80e8f296f58d2f50297b599e96a21cff91b84d0a9c4");
const runtime = await createOwnedRuntimeScratch("mpeg2-abort-goldens-driver-");
let generated = source;
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), exec =',`const root = ${JSON.stringify(root)}, exec =`],
  ['"mpeg2-split-direct-runtime-"','"mpeg2-abort-goldens-runtime-"'],
  ['"scripts/stage-mpeg2-split-direct.mjs"','"scripts/stage-mpeg2-split-abort-diagnostic.mjs"'],
  ['"tests/browser/mpeg2-split-direct-candidate.spec.ts", "--reporter=line"',
    '"tests/browser/mpeg2-split-direct-candidate.spec.ts", "--reporter=line", "--output=" + path.join(runtime.directory,"artifacts")'],
  ['  await finishOwnedCleanup([() => stop(runner), () => stop(server)]);',
    '  try { await finishOwnedCleanup([() => stop(runner), () => stop(server)]); }\n  catch(error) { process.stderr.write(String(error)+"\\n"); process.exitCode=1; }'],
];
for (const [before,after] of patches) { assert.ok(generated.includes(before)); generated = generated.replaceAll(before,after); }
let reversed = generated;
for (const [before,after] of [...patches].reverse()) reversed = reversed.replaceAll(after,before);
assert.equal(reversed,source,"Original FIVE real browser/validator/recovery assertions unchanged");
generated = generated.replace('from "./lib/owned-runtime-scratch.mjs"',
  `from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/owned-runtime-scratch.mjs")).href)}`);
try {
  const file = path.join(runtime.directory,"goldens.mjs"); await writeFile(file,generated,{flag:"wx"});
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
