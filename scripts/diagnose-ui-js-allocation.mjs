import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeUiJsAllocationControl } from "./lib/ui-js-allocation-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
const generated = makeUiJsAllocationControl(source, root);
const check = spawnSync(process.execPath, ["--check", "--input-type=module"],
  { input: generated, encoding: "utf8", windowsHide: true });
assert.equal(check.status, 0, check.stderr);
if (process.argv[2] === "--prepare-only") console.log("Prepared exact reversible JS profiler control; syntax PASS, zero browser executions");
else {
  const files = ["scripts/diagnose-ui-js-allocation.mjs", "scripts/lib/ui-js-allocation-recipe.mjs",
    "scripts/lib/bounded-js-allocation.mjs", "scripts/lib/host-memory-preflight.mjs",
    "scripts/diagnose-ui-native-allocation.mjs", "scripts/lib/chromium-private-memory.mjs",
    "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/private-browser-request.mjs",
    "scripts/mpeg2-split-single-navigation-memory.mjs", "app/converter/ConverterApp.tsx",
    "app/globals.css", "tests/bounded-js-allocation.test.mjs"];
  const sourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))])));
  let control = null;
  const runtime = await createOwnedRuntimeScratch("ui-js-allocation-wrapper-");
  try {
    const target = path.join(runtime.directory, "control.mjs"); await writeFile(target, generated, { flag: "wx" });
    control = await import(pathToFileURL(target).href);
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
  for (const [file, digest] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  assert.ok(control?.completedReportPath, "Actual terminal control report required");
  const reportBytes = await readFile(control.completedReportPath);
  const receipt = { recordedAt: new Date().toISOString(), status: control.completedReport.status,
    sourcePins, generatedControl: { bytes: Buffer.byteLength(generated), sha256: sha(generated) },
    report: { path: path.relative(root, control.completedReportPath).replaceAll("\\", "/"), bytes: reportBytes.length, sha256: sha(reportBytes) },
    wrapperRuntimeDirectory: runtime.directory, wrapperRuntimeRemoved: true, sourcePinsUnchanged: true,
    browserRuns: 1, conversionsPerformed: 0, generatedMediaCopies: 0, publicAcceptance: false };
  const target = path.join(root, `evidence/${path.basename(control.completedReportPath, ".json")}-receipt.json`);
  await writeFile(target, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" }); console.log(target);
}
