// Run an exact additive derivative of the audited download/source/cleanup joins.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeAllocationAttemptCollector } from "./lib/allocation-attempt-build-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = process.argv[2];
const revision = process.argv[3] ?? "";
assert.equal(process.argv.length, revision ? 4 : 3); assert.ok(["", "binding-fix"].includes(revision));
assert.match(runId ?? "", /^[0-9]{8,}$/);
const source = await readFile(path.join(root, "scripts/collect-mpeg2-single-idle-build.mjs"), "utf8");
const recipe = makeAllocationAttemptCollector(source, root, revision);
const runtime = await createOwnedRuntimeScratch("allocation-attempt-collector-");
const sourceFiles = ["scripts/collect-mpeg2-allocation-attempt-build.mjs", "scripts/lib/allocation-attempt-build-recipe.mjs",
  "scripts/collect-mpeg2-single-idle-build.mjs"];
const preimages = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, (await readFile(path.join(root, file))).toString("base64")])));
let failure = null;
try {
  const driver = path.join(runtime.directory, "collector.mjs");
  await writeFile(driver, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(driver).href);
} catch (error) { failure = String(error).slice(0, 4096); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const report = { recordedAt: new Date().toISOString(), runId, revision, failure, generatedSource: recipe.generated,
  generatedSha256: recipe.generatedSha256, sourcePins: Object.fromEntries(Object.entries(preimages).map(([file, bytes]) => [file, sha(Buffer.from(bytes, "base64"))])),
  preimages, ownedRuntime: runtime.directory, ownedRuntimeRemoved: true, browserConversionsPerformed: 0, publicAcceptance: false };
await writeFile(path.join(root, `evidence/mpeg2-allocation-attempt-collector-${runId}.json`), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
if (failure) console.error(failure);
