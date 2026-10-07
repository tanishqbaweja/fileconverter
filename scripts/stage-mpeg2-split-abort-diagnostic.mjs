// Fresh owned generated stager; never changes the executed historical stager.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { extractPinnedSplitAdapter, makeAbortSplitAdapter } from "./lib/mpeg2-abort-original-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(["stage", "restore"].includes(process.argv[2]) && process.argv.length === 3);
const stager = await readFile(path.join(root, "scripts/stage-mpeg2-split-direct.mjs"), "utf8");
const helper = await readFile(path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "utf8");
const original = extractPinnedSplitAdapter(stager), changed = makeAbortSplitAdapter(original, helper);
assert.ok(!/[`]|\$\{/.test(changed), "Literal adapter template must not gain interpolation");
const before = "const adapter = `" + original + "`;";
assert.equal(stager.split(before).length, 2);
let generated = stager.replace(before, "const adapter = `" + changed + "`;");
assert.equal(generated.replace("const adapter = `" + changed + "`;", before), stager);
const rootBefore = 'const root = path.resolve(import.meta.dirname, ".."), name =';
assert.equal(generated.split(rootBefore).length, 2);
generated = generated.replace(rootBefore, `const root = ${JSON.stringify(root)}, name =`);
const runtime = await createOwnedRuntimeScratch("mpeg2-abort-stager-");
try {
  const file = path.join(runtime.directory, "stage.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
