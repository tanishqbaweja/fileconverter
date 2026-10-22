import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxLiveMemoryWorkflow } from "../scripts/lib/vpx-live-memory-workflow.mjs";
test("hosted allocator trace selects exact prefix, reuses pinned binary and never claims Windows memory", async () => {
  const source = await readFile(".github/workflows/ci.yml", "utf8"), workflow = makeVpxLiveMemoryWorkflow(source);
  assert.equal(workflow.nativeBuild, 39623553380); assert.equal(workflow.selectedCases, 3);
  assert.equal(workflow.wasmRebuild, false); assert.equal(workflow.windowsMemoryAcceptance, false);
  assert.equal(workflow.publicAcceptance, false); assert.equal(workflow.diagnosticOnly, true);
  assert.match(workflow.generated, /WITHIN_VPX_DURING_ALLOCATOR_TRACE: "1"/);
  assert.match(workflow.generated, /CPU vp8 decode\|CPU vp9 decode to MPEG4 with default settings/);
  assert.match(workflow.generated, /-during-vp9-memory\.json\.gz/);
  assert.throws(() => makeVpxLiveMemoryWorkflow(source + "\n"));
});
