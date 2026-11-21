import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderProductionDirectScale, replayProductionDirectScale } from "../scripts/report-mkv-production-direct-scale.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const prefix = date => `evidence/2026-11-21T${date}-mkv-hevc-header-core-production-direct-scale-`;

test("actual production direct 5.35 GB output and memory pass are independently reproducible from retained evidence", async () => {
  const file = prefix("18-30-48-338Z") + "5gb.json", r = await replayProductionDirectScale(file);
  assert.equal(r.data.receiptSha256, "350768cc5ef7019acdd6932fcc8a99450dc944590ca23221d877e6bab32d56ec");
  assert.equal(r.data.outputSha256, "bc0d3bac6d8a18b9589b74bdb1bc7c035e1c7b4ee25d40c260360e1b5a38a835");
  assert.equal(r.data.peakMiB, 218.71484375);
  assert.equal(r.data.cleanupMiB, 4.046875);
  assert.equal(r.data.rawRows, 667);
  assert.equal(r.data.validConversionRows, 344);
  assert.equal(r.data.unavailableConversionRows, 0);
  for (const [ext, content] of Object.entries(renderProductionDirectScale(r))) assert.equal((await read(file.replace(/\.json$/, `.${ext}`))).toString(), content);
});

test("actual production direct 9.51 GB output and memory pass retain exact prior content and fresh complete-tree evidence", async () => {
  const file = prefix("18-33-36-740Z") + "near10gb.json", r = await replayProductionDirectScale(file);
  assert.equal(r.data.receiptSha256, "41e2885d758066f6ccc61cc6e61de4647dd28addf6da2809f0871e833e2b3d1d");
  assert.equal(r.data.inputBytes, 9507509956); assert.equal(r.data.outputBytes, 9512261399);
  assert.equal(r.data.outputSha256, "c63e89c25c3122adbe31f8362c7da3e56c2514bd84105ade918a0ac2e766b3f4");
  assert.equal(r.data.peakMiB, 221.34765625); assert.equal(r.data.cleanupMiB, 7.37890625);
  assert.equal(r.data.rawRows, 1908); assert.equal(r.data.validConversionRows, 1421);
  assert.equal(r.data.unavailableConversionRows, 0);
  for (const [ext, content] of Object.entries(renderProductionDirectScale(r))) assert.equal((await read(file.replace(/\.json$/, `.${ext}`))).toString(), content);
});

test("first 5.35 GB run retains exact output evidence but cannot pass without the cleanup checkpoint", async () => {
  const file = prefix("18-27-10-219Z") + "5gb.json", bytes = await read(file), r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(sha(bytes), "6bc4e499366743bfeb3613f038052d3353952cac76a0c6f00f48b6e31bbac5bb");
  assert.equal(r.status, "failed-not-acceptance");
  assert.equal(a.cases[0].validation.outputSha256, "bc0d3bac6d8a18b9589b74bdb1bc7c035e1c7b4ee25d40c260360e1b5a38a835");
  assert.ok(a.cases[0].outputRemoved && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved);
  assert.equal(a.memory.cleanupAboveIdleMiB, null);
  assert.equal(sha(await read(a.archive.file)), a.archive.sha256);
  await assert.rejects(replayProductionDirectScale(file));
});
