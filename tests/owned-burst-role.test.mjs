import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { matchOwnedBurstRole } from "../scripts/lib/owned-burst-role.mjs";

test("diagnostic role requires SAME owned root and child birth; PID reuse, unavailable and malformed strings never infer a service", () => {
  const root = { pid: 1, createdAt: "2026-11-16T00:00:00.1234567Z" };
  const child = { pid: 2, parentPid: 1, createdAt: "2026-11-16T00:03:00.1234567Z" };
  const tree = { processes: [{ ...root }, { ...child, createdAt: "2026-11-16T00:03:00.1234560Z", type: "utility", utilitySubtype: "synthetic.service", sandboxType: "service" }] };
  assert.equal(matchOwnedBurstRole(root, child, tree).utilitySubtype, "synthetic.service");
  const reused = structuredClone(tree); reused.processes[1].createdAt = "2026-11-16T00:04:00Z";
  assert.equal(matchOwnedBurstRole(root, child, reused).type, null);
  const wrongRoot = structuredClone(tree); wrongRoot.processes[0].createdAt = "2026-11-16T00:01:00Z";
  assert.throws(() => matchOwnedBurstRole(root, child, wrongRoot));
  const malformed = structuredClone(tree); malformed.processes[1].utilitySubtype = "not a safe role";
  assert.equal(matchOwnedBurstRole(root, child, malformed).utilitySubtype, null);
});
test("blank control retains NORMAL services, no file/app/conversion/baseline substitution; owned headless launches and finite diagnostic census", async () => {
  const source = await readFile("scripts/diagnose-normal-blank-large-child.mjs", "utf8");
  assert.match(source, /windowsHide: true/); assert.match(source, /--headless=new/);
  assert.doesNotMatch(source, /--disable-|page\.goto\(|setInputFiles|selectExactLocalOriginal/);
  assert.match(source, /attempted\.size < 4/); assert.match(source, /cleanupOwnedChromium/);
  assert.match(source, /baselineReplaced: false, featuresDisabled: false/);
  assert.ok(source.indexOf("safeToStart") < source.indexOf('await createOwnedRuntimeScratch("normal-blank-child-"'));
  assert.match(source, /held-host-memory-preflight-no-browser-launched/);
  assert.match(source, /no-browser-or-runtime-created/);
});
