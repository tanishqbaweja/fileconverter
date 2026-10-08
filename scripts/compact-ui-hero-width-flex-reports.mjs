// Same exact safe two-file compactor, newly bound to the independently verified pair.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const sourcePath = "scripts/compact-ui-hero-flex-reports.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-08T11-27-43-052Z-ui-hero-flex-layout-compaction.json")));
assert.equal(sha(source), prior.sourcePins[sourcePath]);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ['evidence/2026-10-08T11-27-43-052Z-ui-hero-flex-layout.json', 'evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout.json'],
  ['"candidate-layout-rejected"', '"paired-hero-width-layout-geometry-pass-not-public-acceptance"'],
  ['"verified-terminal-hero-layout-pair-not-public-acceptance"', '"verified-terminal-hero-width-layout-pair-not-public-acceptance"'],
  ['assert.equal(analysis.candidateGeometryAccepted, false)', 'assert.equal(analysis.candidateGeometryAccepted, true)'],
  ['output/playwright/2026-10-08T11-27-43-780Z-ui-hero-grid-layout.json', 'output/playwright/2026-10-08T11-39-45-005Z-ui-hero-width-grid-layout.json'],
  ['output/playwright/2026-10-08T11-28-20-254Z-ui-hero-flex-layout.json', 'output/playwright/2026-10-08T11-40-27-791Z-ui-hero-width-flex-layout.json'],
  ['"verified-lossless-ui-hero-raw-report-compaction"', '"verified-lossless-ui-hero-width-raw-report-compaction"'],
  ['scripts/compact-ui-hero-flex-reports.mjs', 'scripts/compact-ui-hero-width-flex-reports.mjs', 2],
];
let generated = source;
for (const [before, after, occurrences = 1] of patches) { assert.equal(generated.split(before).length, occurrences + 1, before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, source, "Only exact new terminal proof/raw bindings; ALL independent/hash/identity/allowed-dir/bounded-lossless-reconstruction checks retained");
const runtime = await createOwnedRuntimeScratch("ui-hero-width-compaction-wrapper-");
try { const target = path.join(runtime.directory, "compact.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
