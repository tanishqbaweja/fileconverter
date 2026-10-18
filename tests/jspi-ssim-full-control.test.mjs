import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { transform } from "esbuild";
import { deriveJspiFullDriver } from "../scripts/lib/jspi-full-control.mjs";
import { deriveSsimJspiFullDriver, deriveSsimJspiFullCaller, deriveSsimJspiFullSupervisor, loadSsimFramingQualification } from "../scripts/lib/jspi-ssim-full-control.mjs";
import { inspectAndRetainSsim } from "../scripts/lib/retained-ssim-validator.mjs";
import { requireNumericSsim } from "../scripts/lib/bounded-ssim-summary.mjs";
const root = process.cwd(), read = file => readFile(path.join(root, file), "utf8");
const parent = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
const previous = JSON.parse(await read("evidence/2026-10-18T02-18-29-564Z-jspi-full-terminal.json"));
const args = [parent.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-ssimTest"), "allocation-attempt-media-ssimTest", [], previous.browserPinBefore];
test("full driver changes only SSIM framing/retention/hash timing; exact native commands and all gates survive", async () => {
  const before = await deriveJspiFullDriver(...args), recipe = await deriveSsimJspiFullDriver(...args);
  let reversed = recipe.generated;
  for (const [old, replacement] of recipe.edits.toReversed()) reversed = reversed.replace(replacement, old);
  assert.equal(reversed, before.generated); assert.equal(recipe.edits.length, 4);
  for (const token of ['ssim >= 0.98', "maximumTimestampErrorSeconds <= 0.001", "run.incrementalPrivateMiB <= 250", '"maximumConversionMs":21600000',
    "number <= 3", "preSsimOutput", "await inspectAndRetainSsim", "loadSsimFramingQualification", "await fullRunJournal.validated"])
    assert.ok(recipe.generated.includes(token), token);
  await transform(recipe.generated, { loader: "js", format: "esm" });
});
test("caller and hidden supervisor bind the qualified correction without touching browser build or settings", async () => {
  const caller = await deriveSsimJspiFullCaller(await read("scripts/run-updated-chrome-full.mjs"), root);
  const supervisor = deriveSsimJspiFullSupervisor(await read("scripts/launch-packet-largest-idle-supervisor.mjs"), root);
  for (const token of ["jspi-ssim-full-live.json", "ssimQualification.files", "row.runs.length,3", "assertJspiFullBuild(build", "await verifyStoppedTree()"])
    assert.ok(caller.generated.includes(token), token);
  assert.ok(supervisor.generated.includes('own = "scripts/run-jspi-ssim-full.mjs"')); assert.ok(supervisor.generated.includes("windowsHide: true"));
  for (const source of [caller.generated, supervisor.generated]) await transform(source, { loader: "js", format: "esm" });
});
test("real native CR logs replay exactly: identical score1 passes, actual score0.971627 remains below unchanged0.98", async () => {
  const qualification = await loadSsimFramingQualification(root);
  assert.equal(qualification.reference.lowQualityNativeScore, 0.971627); assert.equal(qualification.reference.qualityThreshold, 0.98);
  assert.equal(qualification.reference.browserCodecOrSettingsChanged, false);
});
test("raw SSIM stderr is durably retained before missing or low-score rejection, without output-file copies", async () => {
  const directory = await mkdtemp(path.join(root, "work/ssim-retention-test-"));
  try {
    const reports = path.join(directory, "outputs/reports"); await mkdir(reports, { recursive: true });
    const base = path.join(reports, "fixture"), output = { outputBytes: 1234, sha256: "a".repeat(64) };
    const missing = await inspectAndRetainSsim({ root: directory, reportBase: base, number: 1, stderr: "frame=10\rmissing summary", output });
    assert.throws(() => requireNumericSsim(missing));
    assert.equal(gunzipSync(await readFile(path.join(directory, missing.archive.path))).toString(), "frame=10\rmissing summary");
    const low = await inspectAndRetainSsim({ root: directory, reportBase: base, number: 2, stderr: "frame=10\r[Parsed_ssim_4 @ x] SSIM All:0.97 (12)\n", output });
    assert.ok(requireNumericSsim(low) < 0.98); assert.deepEqual(low.output, output);
    await access(path.join(directory, low.archive.path));
    await assert.rejects(inspectAndRetainSsim({ root: directory, reportBase: base, number: 2, stderr: "no summary", output }), { code: "EEXIST" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
