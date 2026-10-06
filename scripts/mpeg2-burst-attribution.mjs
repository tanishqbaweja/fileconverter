// Run once only after the real native-trigger prerequisite and preserved failure.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeBurstAttributionDriver } from "./lib/mpeg2-burst-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const control = JSON.parse(await readFile(path.join(root, "evidence/native-burst-control-passed-2026-10-07.json")));
assert.equal(control.status, "completed-diagnostic"); assert.equal(control.trace.status, "completed-diagnostic");
assert.equal(control.trace.trace.dataLossOccurred, false); assert.equal(control.trace.trace.overflow, false);
assert.equal(control.originalRead, false); assert.equal(control.converterLoaded, false);
assert.equal(control.identicalOriginalFlags, true); assert.equal(control.bursts.eventsDiscarded, 0);
assert.ok(control.bursts.callbacks.some(row => row.status === "completed" && row.result?.success));
for (const value of Object.values(control.cleanup)) assert.equal(value, true);
for (const [file, digest] of Object.entries(control.sourcePins))
  assert.equal(sha(await readFile(path.join(root, file))), digest, file);
const prior = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-static-ui-original-failure-2026-10-07.json")));
assert.equal(prior.incrementalPrivateMiB, 260.52734375); assert.equal(prior.allocationSource, null);
assert.equal(prior.completeOriginalConversion, false);
const burst = JSON.parse(await readFile(path.join(root, "evidence/original-renderer-burst-2026-10-07.json")));
assert.equal(burst.neighbors.increase.adjacent, true); assert.equal(burst.neighbors.increase.treeDeltaPrivateBytes, 59551744);
assert.equal(burst.allocationSource, null);
assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR, "mpeg2-split-pipeline-37479749443");
const manifest = JSON.parse(await readFile(path.join(root, "work/mpeg2-split-pipeline-37479749443/build-manifest.json")));
assert.equal(manifest.alignedReuse.actualLinkedWrapperVerified, true);
assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], prior.candidateDecoderSha256);
assert.equal(sha(await readFile(path.join(root, "app/converter/ConverterApp.tsx"))), prior.sourcePins["app/converter/ConverterApp.tsx"]);
const source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
const generated = makeBurstAttributionDriver(source, root, specifier => import.meta.resolve(specifier));
const runtime = await createOwnedRuntimeScratch("mpeg2-burst-driver-");
try {
  const file = path.join(runtime.directory, "full-source.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
