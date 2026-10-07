import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { makeBudgetControlRetry } from "../scripts/lib/native-budget-control-retry-recipe.mjs";
test("actual pre-browser RAM failure remains zero traces/no owned browser, preserving source and exact safety check", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const failed = JSON.parse(await readFile(path.join(root, "evidence/native-budget-failure-control-2026-10-07.json")));
  assert.equal(failed.status, "failed-diagnostic"); assert.match(failed.failure, /At least2GiB available host RAM/);
  assert.equal(failed.traceStarts, 0); assert.equal(failed.generatedHelper, null); assert.equal(failed.syntheticAllocationBytes, 264 * 1048576);
  assert.equal(failed.runtimeDirectory, null); assert.equal(failed.ownedPids.chrome, null); assert.equal(failed.nativeMemory, null);
  for (const [file, hash] of Object.entries(failed.sourcePins))
    assert.equal(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"), hash, file);
  const source = await readFile(path.join(root, "scripts/probe-native-budget-failure.mjs"), "utf8");
  const generated = makeBudgetControlRetry(source, root, s => import.meta.resolve(s));
  assert.ok(generated.includes("264 * 1048576")); assert.ok(generated.includes("incrementalPrivateMiB > 250"));
  assert.ok(generated.includes("2 * 1024 ** 3")); assert.ok(generated.includes("traceStarts, 0"));
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => makeBudgetControlRetry(source + "\n", root, s => import.meta.resolve(s)));
});
