// Reuse the executed private build verbatim except explicit hosting/observation hooks.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const baseline = JSON.parse(await readFile(path.join(root, "evidence/2026-10-27T10-43-53-069Z-static-shell-build.json")));
const filename = "scripts/build-static-shell-candidate.mjs", original = await readFile(path.join(root, filename), "utf8");
assert.equal(sha(original), baseline.sourcePins[filename], "Exact already-executed private candidate build");
const uri = file => pathToFileURL(path.join(root, file)).href;
const edits = [
  ['import "./lib/hidden-unit-subprocesses.mjs";', `import ${JSON.stringify(uri("scripts/lib/hidden-unit-subprocesses.mjs"))};`],
  ['from "./lib/owned-runtime-scratch.mjs"', `from ${JSON.stringify(uri("scripts/lib/owned-runtime-scratch.mjs"))}`],
  ['import { runStaticShellCandidatePrivacy } from "./lib/static-shell-candidate-privacy.mjs";',
    `import { runStaticShellMemoryComparison as runStaticShellCandidatePrivacy } from ${JSON.stringify(uri("scripts/lib/static-shell-memory-experiment.mjs"))};`],
  ['const root = path.resolve(import.meta.dirname, "..")', `const root = ${JSON.stringify(root)}`],
  ["Private static-shell build, unchanged 19-case headless privacy suite and artifact-size comparison; not memory, fidelity, speed or deployment acceptance",
    "Private same-build matched whole-Chromium page-load memory diagnostic; no conversion, fidelity, speed or deployment acceptance"],
  ['report.privacy?.safeToRemoveRuntime !== false', 'report.memoryComparison?.safeToRemoveRuntime !== false'],
  ['"scripts/build-static-shell-candidate.mjs", "scripts/static-shell-candidate/client.tsx"',
    '"scripts/compare-static-shell-memory.mjs", "scripts/lib/static-shell-memory-experiment.mjs", "scripts/lib/chromium-private-memory.mjs", "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/native-memory-peaks.mjs", "scripts/lib/birth-aware-chromium-memory.mjs", "scripts/lib/birth-aware-memory-observer-source.mjs", "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/installed-chrome-pin.mjs", "scripts/lib/cdp-realm-memory.mjs", "scripts/lib/host-memory-preflight.mjs", "scripts/lib/reliable-owned-identity.mjs", "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/windows-tree-monitor.cs", "scripts/lib/windows-tree-monitor-birth-aware.ps1", "scripts/lib/windows-process-birth-proof.cs", "scripts/build-static-shell-candidate.mjs", "scripts/static-shell-candidate/client.tsx"'],
  ['${stamp}-static-shell-build.json', '${stamp}-static-shell-memory.json'],
];
let generated = original;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let reverse = generated;
for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
assert.equal(reverse, original, "No other candidate-build change");
const runtime = await createOwnedRuntimeScratch("shell-memory-driver-");
try {
  const driver = path.join(runtime.directory, "driver.mjs"); await writeFile(driver, generated, { flag: "wx" });
  const child = spawn(process.execPath, [driver, "--privacy"], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
