// Read-only prerequisite gate. Reuse the successful six-output qualification;
// never repeat those conversions or infer full-original acceptance from them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./recorded-timeline-full-sources.mjs";
import { inspectJspiBrowserResult } from "./jspi-browser-observation.mjs";
import { deriveJspiBrowserDriver, deriveJspiBrowserCaller } from "./jspi-browser-control.mjs";
import { makeJspiBrowserComposition } from "./jspi-browser-native.mjs";
import { deriveJspiBrowserStager } from "./jspi-browser-adapter.mjs";

export const JSPI_SMALL_ANALYSIS = "evidence/2026-10-18-jspi-browser-independent-analysis.json";
export async function loadJspiFullQualification(root) {
  const read = file => readFile(path.join(root, file));
  const analysisBytes = await read(JSPI_SMALL_ANALYSIS);
  assert.equal(sha(analysisBytes), "5eeabf2b281af69e8b8e40b8faf4c5f9066719288651a0703cf52b9f5712bec0");
  const audit = JSON.parse(analysisBytes);
  for (const [file, row] of Object.entries(audit.ownSources)) {
    assert.equal(sha(Buffer.from(row.preimage, "base64")), row.sha256);
    assert.equal(sha(await read(file)), row.sha256, file);
  }
  const pinnedJson = async record => {
    const bytes = await read(record.path); assert.equal(sha(bytes), record.sha256); return JSON.parse(bytes);
  };
  const unpack = async record => {
    const bytes = await read(record.path); assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.sha256);
    const raw = gunzipSync(bytes, { maxOutputLength: 33554432 });
    assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return JSON.parse(raw);
  };
  const terminal = await pinnedJson(audit.terminal), previous = await pinnedJson(audit.previous);
  const report = await unpack(terminal.report), previousReport = await unpack(previous.report);
  const build = await pinnedJson(terminal.build), previousBuild = await pinnedJson(previous.build);
  assert.deepEqual(inspectJspiBrowserResult(terminal, report, previousReport, build, previousBuild), audit.analysis);
  const archive = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
  assert.equal(Object.keys(archive.pins).length, 832);
  assert.deepEqual(archive.pins, terminal.sourcePins); assert.deepEqual(archive.pins, terminal.postSourcePins);
  assert.deepEqual(archive.pins, report.sourceHashes);
  for (const [file, digest] of Object.entries(archive.pins)) assert.equal(sha(await read(file)), digest, file);
  const composition = await makeJspiBrowserComposition(root);
  assert.deepEqual(composition.manifest, report.manifest);
  const fullParent = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = await deriveJspiBrowserDriver(fullParent.driver, root, terminal.wrapper, path.basename(terminal.candidateDirectory), archive.extensionFiles);
  assert.equal(driver.generated, archive.driver);
  assert.equal((await deriveJspiBrowserCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, archive.generatedCaller);
  assert.equal((await deriveJspiBrowserStager(composition.qualified.archive.recipe.generated.stage,
    composition.qualified.archive.recipe.generated.candidateName, path.basename(terminal.candidateDirectory))).generated, archive.stager);
  const control = report.progressProbe.successfulSaveControl, rows = [];
  for (const [index, record] of control.validatedControlCheckpoints.entries()) {
    const checkpoint = await unpack(record);
    assert.equal(checkpoint.completedValidatedControls, index + 1);
    assert.equal(checkpoint.originalValidatorAndOutputCleanupCompleted, true);
    assert.equal(checkpoint.sourceModuleSha256, control.provenance.generatedJavascriptSha256);
    assert.equal(checkpoint.validatorSha256, control.provenance.validatorSha256); rows.push(...checkpoint.rows);
  }
  assert.deepEqual(rows, control.rows.slice(0, rows.length));
  return { reference: { analysis: { path: JSPI_SMALL_ANALYSIS, sha256: sha(analysisBytes) }, terminal: audit.terminal,
    sourceArchive: terminal.sourceArchive, report: terminal.report, build: terminal.build, currentSourcePinsVerified: 832,
    priorSmallOutputs: 6, fullOriginalAcceptance: false, publicAcceptance: false },
  build, manifest: composition.manifest,
  files: [JSPI_SMALL_ANALYSIS, ...Object.keys(audit.ownSources), audit.terminal.path, audit.previous.path,
    terminal.report.path, previous.report.path, terminal.build.path, previous.build.path, terminal.sourceArchive.path,
    ...control.validatedControlCheckpoints.map(row => row.path), ...Object.keys(archive.pins)] };
}

export function assertJspiFullBuild(build, qualified) {
  const binding = ({ role, url, bytes, sha256 }) => ({ role, url, bytes, sha256 });
  assert.deepEqual(build.assets.map(binding), qualified.assets.map(binding));
  assert.deepEqual(binding(build.stylesheet), binding(qualified.stylesheet));
  assert.equal(build.catalogueSlotsReused, true); assert.equal(build.maximumMountedCatalogueCards, 24);
}
