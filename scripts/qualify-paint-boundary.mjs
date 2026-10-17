import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { derivePaintBoundaryCaller, PAINT_VISUAL_PROOF, PAINT_BOUNDARY_CSS } from "./lib/paint-boundary-candidate.mjs";
const root = path.resolve(import.meta.dirname, "..");
const visual = JSON.parse(await readFile(path.join(root, PAINT_VISUAL_PROOF)));
assert.equal(visual.status, "passed-component-only-paint-boundary-pixels-and-geometry"); assert.equal(visual.css, PAINT_BOUNDARY_CSS);
assert.equal(visual.failure, null); assert.deepEqual(visual.cleanupErrors, []);
const runtime = await createOwnedRuntimeScratch("paint-boundary-caller-");
try {
  process.env.WITHIN_RECORDED_TIMELINE_CALLER_DIRECTORY = runtime.directory;
  const source = await readFile(path.join(root, "scripts/run-updated-chrome-full.mjs"), "utf8");
  const file = path.join(runtime.directory, "caller.mjs");
  await writeFile(file, derivePaintBoundaryCaller(source, root).generated, { flag: "wx" }); await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
