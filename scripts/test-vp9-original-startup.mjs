// One-shot headless original startup. Reuses an authenticated current CPU core.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import path from "node:path";
import { transform } from "esbuild";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeVp9OriginalStartupSource } from "./lib/vp9-original-startup-recipe.mjs";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && ["2", "3", "4", "5", "--check-only"].includes(process.argv[2])) ||
  (process.argv.length === 4 && ["2", "3", "4", "5"].includes(process.argv[2]) && process.argv[3] === "--check-only"));
const attempt = ["2", "3", "4", "5"].includes(process.argv[2]) ? Number(process.argv[2]) : 1, suffix = attempt === 1 ? "" : "-attempt" + attempt, checkOnly = process.argv.includes("--check-only");
const root = path.resolve(import.meta.dirname, ".."), sha = value => createHash("sha256").update(value).digest("hex");
const parentFile = "evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269-recipe.json", parentBytes = await readFile(path.join(root, parentFile));
const parent = JSON.parse(parentBytes), bytes = gunzipSync(Buffer.from(parent.generatedSourceGzipBase64, "base64"), { maxOutputLength: 1048576 });
assert.equal(sha(bytes), parent.generatedSha256); assert.equal(parent.privateDurationNativeRunId, "42020605269");
let reconstructed = await readFile(path.join(root, "scripts/test-webcodecs-vp9-smoke.mjs"), "utf8"); assert.equal(sha(reconstructed), parent.parentSha256);
for (const [before, after] of parent.edits) { assert.equal(reconstructed.split(before).length, 2); reconstructed = reconstructed.replace(before, after); }
assert.equal(reconstructed, bytes.toString());
const nativeRunId = attempt >= 3 ? process.env.WITHIN_VP9_ORIGINAL_NATIVE_RUN_ID ?? (checkOnly ? "12345678" : "") : "42020605269";
const recipe = makeVp9OriginalStartupSource(reconstructed, root, attempt, nativeRunId); await transform(recipe.generated, { loader: "js", format: "esm" });
if (checkOnly) console.log(JSON.stringify({ reversible: recipe.reversible, generatedSha256: recipe.generatedSha256, browserLaunched: false, recipeWritten: false }));
else {
  if (attempt >= 3) {
    const native = JSON.parse(await readFile(path.join(root, "evidence/2026-11-06-vp9-original-width-native-" + nativeRunId + ".json")));
    assert.equal(native.nativeContract.engine, attempt === 5 ? "private-vp9-allocation-diagnostic" : attempt === 4 ? "private-vp9-realtime-temporal" : "private-vp9-original-width"); assert.equal(native.nativeContract.candidate.privateVp9ExplicitWidth, 1920);
    assert.equal(native.nativeContract.candidate.memoryLimitsRaised, false); assert.equal(native.publicAcceptance, false);
    if (attempt >= 4) {
      const qualification = JSON.parse(await readFile(path.join(root, "evidence/2026-11-06-vp9-" + (attempt === 5 ? "allocation" : "temporal") + "-qualification-" + nativeRunId + ".json")));
      assert.equal(qualification.status, "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");
      assert.deepEqual(qualification.failures, []); assert.equal(qualification.privateCpuOverride.runId, Number(nativeRunId));
      assert.equal(qualification.independentFidelity.passed, true); assert.equal(qualification.recovery.passed, true);
      assert.equal(qualification.outputSha256, "82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
      if (attempt === 5) {
        assert.equal(native.nativeContract.candidate.allocationDiagnostics.failureOnly, true);
        assert.equal(qualification.temporalAllocationGuard.failureOnlyAllocationDiagnostics, true);
      }
    }
  }
  const { generated, ...compact } = recipe;
  await writeFile(path.join(root, "evidence/2026-11-06-vp9-original-cpu-startup" + suffix + "-recipe.json"), JSON.stringify({ ...compact,
    parentRecipe: parentFile, parentRecipeSha256: sha(parentBytes), generatedSourceGzipBase64: gzipSync(generated, { level: 9 }).toString("base64") }, null, 2) + "\n", { flag: "wx" });
  const runtime = await createOwnedRuntimeScratch("vp9-original-startup-driver-");
  try {
    const file = path.join(runtime.directory, "original-startup.mjs"); await writeFile(file, generated, { flag: "wx" });
    const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
    process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) =>
      signal ? reject(new Error("Original startup interrupted: " + signal)) : resolve(code ?? 1)); });
  } finally { await runtime.close(); }
}
