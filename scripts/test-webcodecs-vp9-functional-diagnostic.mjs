// Exact reversible diagnostic: collect previously unreached real conversion
// facts before applying the SAME baseline/memory verdict. No acceptance bypass.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), sha = x => createHash("sha256").update(x).digest("hex");
const source = await readFile(path.join(root, "scripts/test-webcodecs-vp9-smoke.mjs"), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-first-smoke.json")));
assert.equal(sha(source), prior.sourcePins["scripts/test-webcodecs-vp9-smoke.mjs"]);
assert.equal(prior.status, "failed-private-vp9-browser-smoke"); assert.equal(prior.browserResult, undefined);
assert.equal(prior.blankBaseline, null); assert.equal(prior.ownedRuntimeRemoved, true);
const edits = [...source.matchAll(/from "(\.\/lib\/[a-z0-9-]+\.mjs)"/g)].map(match =>
  [match[0], "from " + JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)]);
edits.push(
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
  ['evidence/2026-11-01-webcodecs-vp9-first-smoke.json', 'evidence/2026-11-01-webcodecs-vp9-functional-diagnostic.json'],
  ['2026-11-01-webcodecs-vp9-first-smoke-failure.zip', '2026-11-01-webcodecs-vp9-functional-diagnostic-failure.zip'],
  ['  assert.equal(report.blankBaseline?.stable, true); report.baselineAdjusted = false;',
    '  report.baselineAdjusted = false; report.baselineAvailable = report.blankBaseline?.stable === true;\n' +
    '  if (!report.baselineAvailable) report.failures.push("Earliest stable blank baseline unavailable; collect functional facts, retain overall failure and null incremental memory");'],
  ['incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null',
    'incrementalPrivateMiB: peaks.peak && report.blankBaseline ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null'],
  ['  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);',
    '  assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required; no smaller metric substitutes");\n' +
    '  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);'],
);
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
assert.equal(reversed, source);
const recipe = { scope: "Collect previously unreached real conversion facts; all original verdicts retained, not acceptance relaxation",
  parentSha256: sha(source), generatedSha256: sha(generated), edits, reversible: true, publicAcceptance: false,
  baselineFormulaChanged: false, baselineWindowOrThresholdChanged: false, nativeOrCodecSettingsChanged: false,
  generatedSourceGzipBase64: gzipSync(generated, { level: 9 }).toString("base64") };
await writeFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-functional-diagnostic-recipe.json"), JSON.stringify(recipe, null, 2) + "\n", { flag: "wx" });
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-diagnostic-");
try {
  const file = path.join(runtime.directory, "diagnostic.mjs"); await writeFile(file, generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => {
    if (signal) reject(new Error("Owned diagnostic interrupted: " + signal)); else resolve(code ?? 1);
  }); });
} finally { await runtime.close(); }
