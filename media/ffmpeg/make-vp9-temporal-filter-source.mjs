// Operates only on the newly owned private build, before libvpx compilation.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeVp9RealtimeTemporalFilterSource } from "./vp9-realtime-temporal-filter-recipe.mjs";
import { VP9_TEMPORAL_LIFETIME_PINS, verifyVp9TemporalLifetimeSources } from "./vp9-temporal-lifetime.mjs";
import { runVp9TemporalCUnit } from "./vp9-temporal-c-unit.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/vp9-duration-build");
assert.equal(process.argv.length, 2); assert.equal(await realpath(build), build);
const vendor = path.join(build, "libvpx"), sources = {};
assert.equal(await realpath(vendor), vendor);
for (const file of Object.keys(VP9_TEMPORAL_LIFETIME_PINS)) {
  const target = path.join(vendor, file); assert.equal(await realpath(target), target);
  sources[file] = await readFile(target, "utf8");
}
const lifetime = verifyVp9TemporalLifetimeSources(sources), source = sources["vp9/encoder/vp9_encoder.c"],
  recipe = makeVp9RealtimeTemporalFilterSource(source), cUnit = await runVp9TemporalCUnit(recipe.edits[0][0]);
const { generated, ...proof } = recipe;
await writeFile(path.join(build, "vp9_encoder.temporal.base.c"), source, { flag: "wx" });
await writeFile(path.join(build, "vp9_encoder.temporal.guard.c"), generated, { flag: "wx" });
await writeFile(path.join(build, "vp9-temporal-filter-source-proof.json"), JSON.stringify({ ...proof, lifetime, cUnit }, null, 2) + "\n", { flag: "wx" });
await writeFile(path.join(vendor, "vp9/encoder/vp9_encoder.c"), generated);
assert.equal(await readFile(path.join(vendor, "vp9/encoder/vp9_encoder.c"), "utf8"), generated);
console.log(JSON.stringify({ appliedBeforeLibraryCompile: true, vendorParentSha256: recipe.parentSha256,
  vendorGeneratedSha256: recipe.generatedSha256, cUnitCalls: cUnit.totalFunctionCalls, publicAcceptance: false }));
