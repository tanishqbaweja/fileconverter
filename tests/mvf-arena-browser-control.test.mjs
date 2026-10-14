import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { loadMvfBrowserComponents, makeMvfBrowserComponents, MVF_DECODER_SHA256 } from "../scripts/lib/mvf-arena-browser-components.mjs";
import { makeMvfBrowserControl } from "../scripts/lib/mvf-arena-control-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
function reverse(recipe) { let source = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) source = source.replace(after, before); return source; }
test("current native verifier retains all 99 sources and derives changed scalar/function bindings", async () => {
  const source = await read("scripts/lib/ebml-reuse-browser-components.mjs"), recipe = makeMvfBrowserComponents(source, root);
  syntax(recipe.generated); assert.equal(reverse(recipe), source); assert.throws(() => makeMvfBrowserComponents(source + "\n", root));
  const components = await loadMvfBrowserComponents(root), native = await components.verifyEbmlNative(root);
  assert.equal(native.envelope.sourceCount, 99); assert.equal(native.proof.decoder.sha256, MVF_DECODER_SHA256);
  const observers = await components.makeEbmlObservers(root, native);
  const realloc = observers.files["realloc-attempt-abort-capture.mjs"], aligned = observers.files["realloc-aligned-attempt-snapshot.mjs"];
  assert.ok(realloc.includes("REALLOC_SLOT = 1919056, REALLOC_ALLOCATOR_ROOT = 1786904"));
  assert.ok(aligned.includes("REALLOC_ALIGNED_SLOT = 1918992"));
  assert.ok(observers.files["realloc-allocation-abort-capture.mjs"].includes("REALLOC_POOL_SLOT = 1919120"));
  assert.ok(observers.files["realloc-composite-abort-capture.mjs"].includes("[4476,4442,4439,4444]"));
  for (const text of Object.values(observers.files)) syntax(text);
});
test("new control retains exact source/birth/privacy/finally gates and uses current runtime slot", async () => {
  const source = await read("scripts/check-ebml-reuse-browser-control.mjs"), recipe = makeMvfBrowserControl(source, root);
  syntax(recipe.generated); assert.equal(reverse(recipe), source);
  for (const token of ["native.proof.layout.within_realloc_attempt_words.address", "actualFiles: 99", "files.length <= 128", "raw.length <= 2097152",
    "native.proof.layout.within_allocator_attempt_words.address", "native.proof.layout.within_refstruct_abort_words.address",
    "executedCallerSource: await readFile", "assertInstalledChromePinsEqual", "await runtime.close()", "control.additions.length, 2",
    "-mvf-arena-browser-control-executed-sources.json", "scripts/check-ebml-reuse-browser-control.mjs"])
    assert.ok(recipe.generated.includes(token), token);
});
