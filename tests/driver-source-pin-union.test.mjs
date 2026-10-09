import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const receipt = JSON.parse(await readFile(new URL("../evidence/2026-10-09T16-13-20-461Z-progress-compositing-original.json", import.meta.url)));
const compressed = await readFile(new URL("../" + receipt.sourceArchive.path, import.meta.url));
assert.equal(sha(compressed), receipt.sourceArchive.sha256);
const source = JSON.parse(gunzipSync(compressed, { maxOutputLength: 8 * 1024 ** 2 }));

test("Exact executed driver exposes all three omissions before launch; existing caller pins retained", () => {
  const coverage = deriveDriverSourcePinFiles(source.generated, Object.keys(receipt.sourcePins));
  assert.deepEqual(coverage.addedDriverFiles, ["scripts/diagnose-split-render-progress.mjs",
    "scripts/lib/split-render-progress-recipe.mjs", "tests/split-render-progress.test.mjs"]);
  assert.equal(coverage.driverUniqueSourceFiles, 130); assert.equal(coverage.declaredDriverEntries, 131);
  assert.equal(coverage.files.length, 148); assert.equal(coverage.beforeLaunchCoverageVerified, true);
  for (const file of Object.keys(receipt.sourcePins)) assert.ok(coverage.files.includes(file));
});

test("Fail closed on dynamic/missing/ambiguous/unbounded lists and unsafe paths; never evaluate code", () => {
  for (const generated of ["", 'const sourceFiles = [process.exit()];',
    'const sourceFiles = ["scripts/a.mjs"];\nconst sourceFiles = ["scripts/b.mjs"];',
    "const sourceFiles = " + JSON.stringify(Array(257).fill("scripts/a.mjs")) + ";"]) {
    assert.throws(() => deriveDriverSourcePinFiles(generated, []));
  }
  for (const file of ["../a.mjs", "/a.mjs", "C:/a.mjs", "scripts\\a.mjs", "scripts//a.mjs", "./a.mjs", "test.mkv"])
    assert.throws(() => deriveDriverSourcePinFiles("const sourceFiles = " + JSON.stringify([file]) + ";", []));
  assert.throws(() => deriveDriverSourcePinFiles("x".repeat(1024 * 1024 + 1), []));
  assert.deepEqual(deriveDriverSourcePinFiles('const sourceFiles = ["evidence/a.json.gz"];', []).files, ["evidence/a.json.gz"]);
  assert.throws(() => deriveDriverSourcePinFiles('const sourceFiles = ["test.mkv.gz"];', []));
});

test("Future controller pins union before build/child launch without changing archived driver or conversion gates", async () => {
  const text = await readFile(new URL("../scripts/diagnose-progress-compositing-original.mjs", import.meta.url), "utf8");
  assert.ok(text.indexOf("const sourcePinCoverage =") < text.indexOf("if (prepareOnly)"));
  assert.ok(text.indexOf("const sourcePinCoverage =") < text.indexOf("child = spawn("));
  assert.ok(text.includes("sourcePins[file] = sha(bytes)"));
  assert.ok(text.includes("sourcePins, sourcePinCoverage, postSourcePins"));
  assert.equal(sha(source.generated), receipt.sourceArchive.driverSha256);
});
