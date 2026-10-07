import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeBudgetControlRetry } from "./lib/native-budget-control-retry-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const failed = JSON.parse(await readFile(path.join(root, "evidence/native-budget-failure-control-2026-10-07.json")));
assert.equal(failed.status, "failed-diagnostic"); assert.equal(failed.traceStarts, 0);
assert.equal(failed.runtimeDirectory, null); assert.equal(failed.ownedPids.chrome, null);
for (const [file, digest] of Object.entries(failed.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
const host = await inspectStressHostMemory(); console.log(JSON.stringify({ scope: "read-only-control-retry-preflight", host }));
if (!host.safeToStart) { console.log("Held before browser/profile/allocation; no automatic repeated launch."); process.exitCode = 1; }
else {
  await assert.rejects(access(path.join(root, "evidence/native-budget-failure-control-retry-2026-10-07.json")), { code: "ENOENT" });
  const generated = makeBudgetControlRetry(await readFile(path.join(root, "scripts/probe-native-budget-failure.mjs"), "utf8"), root, s => import.meta.resolve(s));
  const runtime = await createOwnedRuntimeScratch("budget-control-retry-driver-");
  try {
    const file = path.join(runtime.directory, "control.mjs"); await writeFile(file, generated, { flag: "wx" });
    await import(pathToFileURL(file).href);
  } finally { await runtime.close(); }
}
