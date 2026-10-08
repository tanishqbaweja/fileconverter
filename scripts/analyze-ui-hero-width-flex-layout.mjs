// Preserve the actual independent verifier; only bind the new width candidate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/analyze-ui-matrix-flex-layout.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-08T08-38-48-399Z-ui-matrix-flex-layout-analysis.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ["-ui-matrix-flex-layout.json", "-ui-hero-width-flex-layout.json"],
  ["verified-terminal-matrix-layout-pair-not-public-acceptance", "verified-terminal-hero-width-layout-pair-not-public-acceptance"],
  ["scripts/analyze-ui-matrix-flex-layout.mjs", "scripts/analyze-ui-hero-width-flex-layout.mjs"],
];
let generated = source;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Same ALL-process/private snapshots/partial types/source/raw/UI/geometry/native PID-parent-birth/cleanup/full protected SHA gates");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("ui-hero-width-analysis-wrapper-");
try { const target = path.join(runtime.directory, "analyze.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
