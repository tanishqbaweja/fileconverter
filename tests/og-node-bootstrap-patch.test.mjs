import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { patchOgNodeBootstrap,ogNodeBootstrapBanner } from "../scripts/lib/og-node-bootstrap-patch.mjs";
test("Node bootstrap refuses unknown modules, is module-local and does not modify serialization or global state",async()=>{
  assert.throws(()=>patchOgNodeBootstrap(Buffer.from("unknown")),/Unknown OG module/);
  assert.throws(()=>patchOgNodeBootstrap(Buffer.from(ogNodeBootstrapBanner+"unknown")),/Unknown OG module/);
  assert.match(ogNodeBootstrapBanner,/const require = withinOgCreateRequire\(import.meta.url\)/);
  assert.match(ogNodeBootstrapBanner,/const __dirname/);assert.doesNotMatch(ogNodeBootstrapBanner,/globalThis|process.env|eval\(/);
  assert.match(ogNodeBootstrapBanner,/withinOgSatoriRequire.resolve\("harfbuzzjs"\)/);
  const failed=JSON.parse(await readFile("evidence/2026-10-29-og-security-candidate-selected.json"));
  assert.equal(failed.status,"failed-isolated-og-security-candidate");assert.equal(failed.audit.metadata.vulnerabilities.total,0);
  assert.match(failed.failure,/Dynamic require of "fs" is not supported/);assert.equal(failed.applicationGraphChanged,false);assert.equal(failed.ownedScratchRemoved,true);
});
