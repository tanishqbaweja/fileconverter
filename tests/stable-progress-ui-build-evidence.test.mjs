import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeStableProgressUiSource, recoverStableProgressUiBaseline } from "../scripts/lib/stable-progress-ui-recipe.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const build = JSON.parse(await read("evidence/2026-10-08T13-25-27-825Z-stable-progress-ui-build.json"));
const terminal = JSON.parse(await read("evidence/2026-10-08T13-25-27-825Z-stable-progress-ui-goldens.json"));
test("Actual candidate production build is hash-bound, lint/type clean and exactly reversible; no browser acceptance", async () => {
  assert.equal(build.status, "production-candidate-built-not-browser-acceptance");
  const archive = await read(build.archive.path); assert.equal(sha(archive), build.archive.sha256); assert.equal(archive.length, build.archive.bytes);
  const candidate = gunzipSync(archive).toString(); assert.equal(sha(candidate), build.candidateSha256); assert.equal(Buffer.byteLength(candidate), build.candidateBytes);
  const baseline = (await read("app/converter/ConverterApp.tsx")).toString();
  assert.equal(sha(baseline), build.baselineSha256); assert.equal(recoverStableProgressUiBaseline(candidate), baseline);
  assert.equal(makeStableProgressUiSource(baseline), candidate);
  assert.equal(build.candidateLintErrors, 0); assert.equal(build.candidateLintWarnings, 0); assert.equal(build.candidateTypeDiagnostics, 0);
  assert.ok(build.overlayLoads.some(row => row.environment === "client"));
  assert.ok(build.overlayLoads.some(row => row.environment === "rsc"));
  assert.equal(build.assets.length, 1);
  for (const field of ["cssChanged", "engineChanged", "limitsChanged", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(build[field], false);
});
test("Actual second guard stopped before browser; normal production build and protected full original restored", async () => {
  assert.equal(terminal.status, "failed-or-incomplete");
  assert.ok(terminal.failure.includes("goldens.mjs:66:10")); assert.deepEqual(terminal.reports, []);
  assert.deepEqual(terminal.protectedPre, terminal.protectedPost);
  assert.equal(terminal.protectedPre.bytes, 2958573265);
  assert.equal(terminal.protectedPre.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(terminal.sourcePins, terminal.postSourcePins);
  for (const [file, hash] of Object.entries(terminal.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  const archived = await read(terminal.generatedArchive.path); assert.equal(sha(archived), terminal.generatedArchive.sha256);
  const generated = JSON.parse(gunzipSync(archived));
  for (const [name, source] of Object.entries(generated)) assert.equal(sha(source), terminal.generatedHashes[name]);
  assert.equal(terminal.cleanup.restoredProductionBuild, true); assert.equal(terminal.cleanup.ownedWrapperRemoved, true);
  await assert.rejects(access(terminal.cleanup.ownedWrapper), { code: "ENOENT" });
  for (const field of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(terminal[field], false);
});
