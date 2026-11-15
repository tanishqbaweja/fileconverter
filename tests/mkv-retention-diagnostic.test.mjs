import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MKV_RETENTION_LIMITS } from "../scripts/lib/mkv-retention-diagnostic.mjs";

test("retention diagnostic is finite, explicitly non-acceptance, same real original and whole-byte content gate; never forced GC", async () => {
  assert.deepEqual(MKV_RETENTION_LIMITS, { jobs: 6, checkpoints: 19, allocatorCheckpoints: 4, checkpointBytes: 65536 });
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(source, /--hevc-header-parser-protected-retention/);
  assert.match(source, /headerProtectedRepeats = headerProtectedRetention \|\|/);
  assert.match(source, /for \(const count of headerProtectedRetention \? \[MKV_RETENTION_LIMITS.jobs\] : \[3, 1\]\)/);
  assert.match(source, /completed-header-core-protected-retention-diagnostic-not-acceptance/);
  assert.match(source, /Current-core repeat changed independently validated complete output/);
  assert.match(source, /same clean Chromium|whole-Chromium gate exceeded/);
  assert.match(source, /cleanupAboveIdleMiB <= 96/);
  assert.match(source, /result\.retention = await retention\.close\(\)/);
  assert.match(source, /retentionFailureCheckpoint = await retention\.capture\("budget-failure", true\)/);
  const helper = await readFile("scripts/lib/mkv-retention-diagnostic.mjs", "utf8");
  assert.match(helper, /assert\.equal\(pending, null\)/);
  assert.match(helper, /forcedGc: false, perturbsMemory: true, acceptanceMetric: false/);
  assert.match(helper, /Memory\.getDOMCounters/);
  assert.doesNotMatch(helper, /collectGarbage|HeapProfiler|readFile|\.arrayBuffer\(/);
});
