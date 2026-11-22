import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hevcHeaderLoopReference } from "../scripts/lib/mkv-hevc-header-core-reference.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = b => createHash("sha256").update(b).digest("hex");

test("hosted fresh rebuild, owned cleanup and local real static responses bind the same qualified code", async () => {
  const ci = JSON.parse(await read("evidence/2026-11-22-mkv-hevc-header-hosted-reproduction.json"));
  const bytes = await read("evidence/2026-11-22T07-43-18-367Z-mkv-private-static-delivery.json");
  assert.equal(sha(bytes), "c47e08a6fa4fbff06222bfa55030b40be658bb76de0de257a63b53826e69ec42");
  const http = JSON.parse(bytes), { hostedRun, retainedArtifactInventory, verifierLogReceipt: built } = ci;
  const previous = await read(hevcHeaderLoopReference.file);
  assert.equal(sha(previous), hevcHeaderLoopReference.sha256);
  const { candidateBuild: old } = JSON.parse(previous);
  assert.equal(hostedRun.conclusion, "success");
  assert.equal(hostedRun.headSha, built.job.GITHUB_SHA);
  assert.equal(String(hostedRun.databaseId), built.job.GITHUB_RUN_ID);
  assert.ok(hostedRun.job.steps.length === 3 && hostedRun.job.steps.every(s => s.conclusion === "success"));
  assert.match(hostedRun.job.steps.at(-1).name, /^Remove owned SDK/);
  assert.equal(retainedArtifactInventory.total_count, 1);
  assert.equal(retainedArtifactInventory.artifacts[0].name, `corrected-mkv-reproduction-receipt-${hostedRun.databaseId}`);
  assert.ok(retainedArtifactInventory.artifacts[0].size_in_bytes < 4096);
  assert.deepEqual(built.rebuiltArtifacts, old.build.artifacts);
  assert.deepEqual(built.abi, old.abi);
  assert.deepEqual(built.wasmMemory, old.build.wasmMemory);
  assert.deepEqual(built.previousQualifiedBuild, http.qualifiedBuild);
  assert.equal(built.mediaInputs, 0); assert.equal(built.deployed, false); assert.equal(built.publicAcceptance, false);
  assert.equal(http.status, "passed-exact-private-engine-package-served-on-loopback-not-browser-qualification");
  assert.equal(http.default.privatePathsAbsent, true); assert.equal(http.defaultBuildUnchanged, true);
  assert.equal(http.privateServerClosed, true); assert.equal(http.defaultServerClosed, true);
  assert.equal(http.defaultRuntimeRemoved, true); assert.equal(http.ownedRuntimeRemoved, true);
  assert.deepEqual(http.default.worker, http.private.worker);
  assert.equal(http.private.worker.browserWorkerResponseOverridden, false);
  assert.deepEqual(http.private.assets.map(({ relative, bytes, sha256 }) => ({ relative, bytes, sha256 })), built.packaged);
  assert.deepEqual(http.private.assets.map(a => a.mime), ["text/javascript; charset=utf-8", "application/wasm", "text/plain; charset=utf-8"]);
  assert.ok(http.private.assets.every(a => a.securityHeadersVerified));
  for (const flag of ["published", "originalOpened", "browserLaunched", "responseInterceptionUsed", "freshNativeBuildClaimed"]) assert.equal(http[flag], false);
});

test("initial package smoke missing license type was not silently counted as passing", async () => {
  const bytes = await read("evidence/2026-11-22T07-42-44-058Z-mkv-private-static-delivery.json");
  assert.equal(sha(bytes), "e08e453bf84ecbc61cede3d6999db3fac447dfa5fcc0c1cdcb337699e72f8093");
  const r = JSON.parse(bytes);
  assert.equal(r.status, "failed-not-acceptance");
  assert.equal(r.default.privatePathsAbsent, true);
  assert.match(r.failures[0], /verifyStaticAsset/);
  assert.ok(r.ownedRuntimeRemoved && r.defaultRuntimeRemoved && r.privateServerClosed);
});
