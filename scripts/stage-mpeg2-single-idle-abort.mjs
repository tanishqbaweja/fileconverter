// Same controlled failure observer, newly qualified exact binary; generated assets only.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeLateAllocatorAbortAdapter } from "./lib/mpeg2-late-allocator-abort-adapter.mjs";
import { makeSingleIdleBrowserRecipe, FROZEN_BROWSER_SOURCES, SINGLE_IDLE_SLOT } from "./lib/single-idle-browser-recipe.mjs";
import { verifySingleIdleAbortQualification } from "./lib/single-idle-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 3); assert.ok(["stage", "restore"].includes(process.argv[2]));
assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, SINGLE_IDLE_SLOT);
const qualification = JSON.parse(await read("evidence/mpeg2-single-idle-abort-layout-2026-10-10.json"));
verifySingleIdleAbortQualification(qualification);
for (const [file, digest] of Object.entries(qualification.sourcePins)) assert.equal(sha(await read(file)), digest, file);
assert.equal(sha(await read("work/" + SINGLE_IDLE_SLOT + "/within-mpeg2-split.wasm")), qualification.binary.sha256);
assert.equal(sha(await read("work/" + SINGLE_IDLE_SLOT + "/decoder-link.map")), qualification.mapSha256);
const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
const { original, adapter } = makeLateAllocatorAbortAdapter({ stager: sources["scripts/stage-mpeg2-split-direct.mjs"],
  stackHelper: (await read("scripts/lib/bounded-wasm-abort-capture.mjs")).toString(),
  snapshotHelper: (await read("scripts/lib/late-refstruct-abort-snapshot.mjs")).toString(),
  poolHelper: (await read("scripts/lib/late-pool-abort-capture.mjs")).toString(),
  allocatorHelper: (await read("scripts/lib/late-pool-allocator-abort-capture.mjs")).toString(),
  freeHeaderHelper: (await read("scripts/lib/dlmalloc-free-header-inspection.mjs")).toString(),
  controlProof: JSON.parse(await read("evidence/late-pool-abort-control-2026-10-08.json")),
  allocatorControlProof: JSON.parse(await read("evidence/late-pool-allocator-abort-control-2026-10-08.json")),
  layoutProof: JSON.parse(await read("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json")) });
assert.equal(Buffer.byteLength(adapter), 18330); assert.equal(sha(adapter), "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837");
const runtime = await createOwnedRuntimeScratch("single-idle-abort-stager-");
try {
  const branch = JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json"));
  const recipe = makeSingleIdleBrowserRecipe(sources, root, runtime.directory, "2026-10-10T00-00-00-000Z", branch);
  const before = "const adapter = `" + original + "`;", after = "const adapter = " + JSON.stringify(adapter) + ";";
  assert.equal(recipe.stage.split(before).length, 2); const generated = recipe.stage.replace(before, after);
  assert.equal(generated.replace(after, before), recipe.stage);
  const target = path.join(runtime.directory, "stage.mjs"); await writeFile(target, generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); }
