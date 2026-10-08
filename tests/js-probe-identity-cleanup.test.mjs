import assert from "node:assert/strict";
import test from "node:test";
import { verifyJsProbeIdentityAbsence } from "../scripts/lib/js-probe-identity-cleanup.mjs";
const original = { pid: 32192, parentPid: 43592, createdAt: "2026-10-08T12:23:50.7667340Z" };
test("Native cleanup requires original exact identity absence, not absence of reused numbers", () => {
  assert.throws(() => verifyJsProbeIdentityAbsence([original], [original]), /identity still alive/);
  const reused = { pid: 32192, parentPid: 25576, createdAt: "2026-10-08T12:27:14.4124730Z" };
  const proof = verifyJsProbeIdentityAbsence([original], [reused]);
  assert.equal(proof.originalIdentitiesAbsent, true); assert.equal(proof.reusedPids.length, 1);
  assert.equal(proof.noProcessesKilled, true); assert.deepEqual(proof.reusedPids[0].current, reused);
  assert.equal(verifyJsProbeIdentityAbsence([original], []).reusedPids.length, 0);
});
test("Missing native birth times cannot silently pass cleanup", () => {
  assert.throws(() => verifyJsProbeIdentityAbsence([original], [{ ...original, createdAt: null }]));
  assert.throws(() => verifyJsProbeIdentityAbsence([{ ...original, parentPid: null }], []));
});
