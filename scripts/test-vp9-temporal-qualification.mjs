// One headless small bit-exact/fidelity/adverse-path/recovery control, not stress.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { transform } from "esbuild";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeVp9TemporalQualificationSource } from "./lib/vp9-temporal-qualification-recipe.mjs";
const args = process.argv.slice(2);
assert.ok(args.length <= 2 && new Set(args).size === args.length && args.every(arg => ["--allocation-diagnostic","--lazy-utility", "--check-only"].includes(arg)));
assert.ok(!(args.includes("--allocation-diagnostic")&&args.includes("--lazy-utility")));
const checkOnly = args.includes("--check-only"),lazyUtility=args.includes("--lazy-utility"), allocationDiagnostics = args.includes("--allocation-diagnostic")||lazyUtility, root = path.resolve(import.meta.dirname, ".."),
  runId = process.env.WITHIN_VP9_ORIGINAL_NATIVE_RUN_ID ?? (checkOnly ? "12345678" : ""), sha = v => createHash("sha256").update(v).digest("hex");
const parentFile = "evidence/2026-11-05-webcodecs-vp9-recovery-qualification-42020605269-recipe.json", parentBytes = await readFile(path.join(root, parentFile)), parent = JSON.parse(parentBytes);
const source = gunzipSync(Buffer.from(parent.generatedSourceGzipBase64, "base64"), { maxOutputLength: 1048576 }).toString();
assert.equal(sha(source), parent.generatedSha256);
let reconstructed = await readFile(path.join(root, "scripts/test-webcodecs-vp9-smoke.mjs"), "utf8"); assert.equal(sha(reconstructed), parent.parentSha256);
for (const [before, after] of parent.edits) { assert.equal(reconstructed.split(before).length, 2); reconstructed = reconstructed.replace(before, after); }
assert.equal(reconstructed, source);
const recipe = makeVp9TemporalQualificationSource(source, runId, { allocationDiagnostics,lazyUtility }); await transform(recipe.generated, { loader: "js", format: "esm" });
if (checkOnly) console.log(JSON.stringify({ reversible: true, generatedSha256: recipe.generatedSha256, browserLaunched: false, recipeWritten: false }));
else {
  const native = JSON.parse(await readFile(path.join(root, "evidence/2026-11-06-vp9-original-width-native-" + runId + ".json")));
  assert.equal(native.nativeContract.engine,lazyUtility?"private-vp9-lazy-utility":allocationDiagnostics ? "private-vp9-allocation-diagnostic" : "private-vp9-realtime-temporal");
  if(lazyUtility)assert.equal(native.nativeContract.candidate.lazyUtility.codecSettingsChanged,false);
  if (allocationDiagnostics) assert.equal(native.nativeContract.candidate.allocationDiagnostics.failureOnly, true);
  assert.equal(native.nativeContract.candidate.vendorAllocationGuard.edits, 1);
  assert.equal(native.nativeContract.candidate.memoryLimitsRaised, false); assert.equal(native.publicAcceptance, false);
  const { generated, ...compact } = recipe;
  await writeFile(path.join(root, "evidence/2026-11-06-vp9-" + (lazyUtility?"lazy":allocationDiagnostics ? "allocation" : "temporal") + "-qualification-" + runId + "-recipe.json"), JSON.stringify({ ...compact,
    parentRecipe: parentFile, parentRecipeSha256: sha(parentBytes), generatedSourceGzipBase64: gzipSync(generated, { level: 9 }).toString("base64") }, null, 2) + "\n", { flag: "wx" });
  const runtime = await createOwnedRuntimeScratch("vp9-temporal-qualification-");
  try {
    const file = path.join(runtime.directory, "qualification.mjs"); await writeFile(file, generated, { flag: "wx" });
    const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
    process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) =>
      signal ? reject(new Error("Temporal qualification interrupted: " + signal)) : resolve(code ?? 1)); });
  } finally { await runtime.close(); }
}
