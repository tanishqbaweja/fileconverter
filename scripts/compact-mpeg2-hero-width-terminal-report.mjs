// Same exact terminal lossless/identity-aware compactor, new actual failed report.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const sourcePath = "scripts/compact-mpeg2-matrix-terminal-report.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-matrix-terminal-compaction-2026-10-08.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ['evidence/mpeg2-matrix-terminal-analysis-2026-10-08.json', 'evidence/mpeg2-hero-width-terminal-analysis-2026-10-08.json'],
  ['evidence/mpeg2-matrix-original-2026-10-08.json', 'evidence/mpeg2-hero-width-original-2026-10-08.json'],
  ['evidence/mpeg2-matrix-terminal-compaction-2026-10-08.json', 'evidence/mpeg2-hero-width-terminal-compaction-2026-10-08.json'],
  ['scripts/compact-mpeg2-matrix-terminal-report.mjs', 'scripts/compact-mpeg2-hero-width-terminal-report.mjs'],
  ['matrix-terminal-report-compact-', 'hero-width-terminal-report-compact-'],
  ['matrix-terminal-compaction-', 'hero-width-terminal-compaction-'],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Only exact new terminal proof/analysis/archive bindings; all bounded streams/hash/allowed realpath/file identity/reconstruction/exact removal/finally checks preserved");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("hero-width-terminal-compaction-wrapper-");
try { const target = path.join(runtime.directory, "compact.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
