import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { assertLargestBurstPrerequisites } from "../scripts/lib/largest-burst-prerequisites.mjs";
test("actual blank/UI prerequisite schemas require real success, no trace loss and finally cleanup", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const [blank, ui] = await Promise.all(["largest-blink-type-control", "ui-largest-blink-types"]
    .map(async name => JSON.parse(await readFile(path.join(root, `evidence/${name}-2026-10-07.json`)))));
  assertLargestBurstPrerequisites(blank, ui);
  const lost = structuredClone(ui); lost.traces[0].trace.dataLossOccurred = true;
  assert.throws(() => assertLargestBurstPrerequisites(blank, lost));
  assert.throws(() => assertLargestBurstPrerequisites({ ...blank, status: "completed-diagnostic" }, ui));
});
