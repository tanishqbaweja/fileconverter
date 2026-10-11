import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { makeAlignment16ExportRecipe, makeAlignment16ControlBrowserFactory, makeAlignment16ControlCaller, ALIGNMENT16_DECODER_SHA256 } from "../scripts/lib/alignment16-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), text = file => readFile(path.join(root, file), "utf8");
function reverses(recipe, old) { let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replaceAll(after, before); assert.equal(reversed, old); }
function parses(source) { const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true }); assert.equal(result.status, 0, result.stderr); }
test("new observers differ only in exact current binary qualification/import, keep all schema/bounds/failure guards", async () => {
  const attempt = await text("scripts/lib/alignment16-attempt-abort-capture.mjs"), oldAttempt = await text("scripts/lib/allocation-attempt-abort-capture.mjs");
  assert.equal(attempt.replace(ALIGNMENT16_DECODER_SHA256, "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039").trimEnd(), oldAttempt.trimEnd());
  const composite = await text("scripts/lib/alignment16-composite-abort-capture.mjs"), oldComposite = await text("scripts/lib/composite-allocation-abort-capture.mjs");
  assert.equal(composite.replace("./alignment16-attempt-abort-capture.mjs", "./allocation-attempt-abort-capture.mjs").trimEnd(), oldComposite.trimEnd());
  parses(attempt); parses(composite);
});
test("export-only/browser factory/caller actually generate and parse; all128/2MiB/source/privacy/cleanup gates retained", async () => {
  const exporter = makeAlignment16ExportRecipe(await text("scripts/lib/refstruct-export-only-control.mjs")); parses(exporter.generated);
  const browser = makeAlignment16ControlBrowserFactory(await text("scripts/lib/direct-buffer-control-browser-recipe.mjs")); parses(browser.generated);
  const caller = makeAlignment16ControlCaller(await text("scripts/check-allocation-attempt-abort-control.mjs"), root); parses(caller.generated);
  for (const token of ["files.length <= 128", "bytes.length <= 2097152", "await runtime.close()", "syntheticOnly", "allCodeDataTypesImportsTablesMemoryExact"])
    assert.ok((caller.generated + exporter.generated).includes(token), token);
  for (const specifier of [...caller.generated.matchAll(/^import [^\n]+ from "(file:[^"]+)";/gm)].map(match => match[1])) await readFile(new URL(specifier));
  assert.ok(caller.generated.includes(pathToFileURL(path.join(root, "scripts/lib/alignment16-control-recipe.mjs")).href));
  assert.ok(browser.generated.includes("alignment16-composite-abort-capture.mjs"));
  reverses(exporter, exporter.generated.replace(JSON.stringify(ALIGNMENT16_DECODER_SHA256), JSON.stringify("9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039")));
});
