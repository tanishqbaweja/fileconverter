import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { verifyAttemptPlaneCandidate, makeLargestIdleFullStager } from "./lib/packet-largest-idle-full-recipe.mjs";
assert.ok(process.argv.length === 3 && ["stage", "restore"].includes(process.argv[2]));
const root = path.resolve(import.meta.dirname, ".."), name = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
assert.match(name ?? "", /^allocation-attempt-media-[A-Za-z0-9]+$/);
await verifyAttemptPlaneCandidate(root, path.join(root, "work", name));
const recipe = await makeLargestIdleFullStager(root, name), runtime = await createOwnedRuntimeScratch("packet-largest-idle-full-stager-");
try { const file = path.join(runtime.directory, "stage.mjs"); await writeFile(file, recipe.generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); }
