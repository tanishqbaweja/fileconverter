// Bind distinct actual tree/renderer expressions; keep executed preparation failure immutable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const sourcePath = "scripts/analyze-mpeg2-hero-width-terminal.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const failed = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-hero-width-terminal-verifier-preparation-failure-2026-10-08.json")));
assert.equal(sha(source), failed.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ["['56823808', '40828928']", "['failure.delta.treeDeltaPrivateBytes,56823808', 'failure.delta.treeDeltaPrivateBytes,40828928']"],
  ["['56807424', '40828928']", "['target.deltaPrivateBytes,56807424', 'target.deltaPrivateBytes,40828928']"],
  ['scripts/analyze-mpeg2-hero-width-terminal.mjs', 'scripts/analyze-mpeg2-hero-width-terminal-bound.mjs'],
];
let generated = source;
for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source, "Only unambiguous constant-expression binding; every independent assertion/cap/source/dump/identity/cleanup/full source SHA check retained");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-hero-width-bound-analysis-wrapper-");
try { const target = path.join(runtime.directory, "analyze.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
