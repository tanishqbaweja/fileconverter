// Derive from executed correctness gates; bind intentionally changed CSS separately.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { baselineBinding, makeStableUiHeadlessBaseline, sha } from "./stable-ui-headless-baseline-recipe.mjs";

const normalStylesheet = { url: "/assets/index-CIzbeB0A.css", bytes: 26213,
  sha256: "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd" };
function replaceExactly(source, patches) {
  let value = source;
  for (const [before, after] of patches) {
    assert.equal(value.split(before).length, 2, `Unique replacement: ${before}`);
    value = value.replace(before, after);
  }
  let recovered = value;
  for (const [before, after] of patches.toReversed()) recovered = recovered.replace(after, before);
  assert.equal(recovered, source, "Reversible additions; unchanged conversion/quality/privacy/cleanup assertions");
  return value;
}
function validateBinding(binding, expression) {
  assert.match(binding.url, expression); assert.ok(binding.bytes > 0 && binding.bytes < 1048576);
  assert.match(binding.sha256, /^[a-f0-9]{64}$/);
}
export function makeProgressCompositingGoldens(executed, root, runtime, stamp, appBinding, cssBinding, cssBytes) {
  validateBinding(appBinding, /^\/assets\/ConverterApp-[\w-]+\.js$/);
  validateBinding(cssBinding, /^\/assets\/[\w-]+\.css$/);
  assert.notDeepEqual(appBinding, baselineBinding); assert.notDeepEqual(cssBinding, normalStylesheet);
  assert.equal(cssBytes.length, cssBinding.bytes); assert.equal(sha(cssBytes), cssBinding.sha256);
  const baseline = makeStableUiHeadlessBaseline(executed, root, runtime, stamp);
  const match = /^const matrixCss = (.*);$/m.exec(baseline.spec); assert.ok(match);
  const matrixCss = JSON.parse(match[1]); assert.ok(matrixCss.length > 0 && matrixCss.length < 4096);
  const finalCss = Buffer.concat([cssBytes, Buffer.from(matrixCss)]);
  const stylesheetBinding = { ...cssBinding, afterBytes: finalCss.length, afterSha256: sha(finalCss),
    matrixCssBytes: Buffer.byteLength(matrixCss), matrixCssSha256: sha(matrixCss) };
  const patches = [
    [JSON.stringify(baselineBinding), JSON.stringify(appBinding)],
    ['kind: "actual-served-stable-ui-baseline"', 'kind: "actual-served-progress-compositing-candidate"'],
    [JSON.stringify(stamp + "-baseline-matrix-goldens"), JSON.stringify(stamp + "-progress-compositing-matrix-goldens")],
    ['    expect(stylesheetRecords.length).toBe(0);\n    const body = css + matrixCss;',
      `    expect(stylesheetRecords.length).toBe(0);\n    const actualCssBinding = ${JSON.stringify(stylesheetBinding)};\n` +
      '    expect(new URL(route.request().url()).pathname).toBe(actualCssBinding.url);\n' +
      '    expect(Buffer.byteLength(css)).toBe(actualCssBinding.bytes);\n' +
      '    expect(createHash("sha256").update(css).digest("hex")).toBe(actualCssBinding.sha256);\n' +
      '    const body = css + matrixCss;\n' +
      '    expect(Buffer.byteLength(body)).toBe(actualCssBinding.afterBytes);\n' +
      '    expect(createHash("sha256").update(body).digest("hex")).toBe(actualCssBinding.afterSha256);'],
  ];
  const spec = replaceExactly(baseline.spec, patches);
  // Existing driver predates the birth-identity rule. Add identity-bound helper cleanup,
  // not a broad PID sweep; keep actual staged core, engine settings and test timeouts.
  const identityUri = pathToFileURL(path.join(root, "scripts/lib/owned-process-exit-observation.mjs")).href;
  const launchPath = `outputs/reports/${stamp}-progress-compositing-golden-launch-identities.json`;
  const driverPatches = [
    ['import { access } from "node:fs/promises";', 'import { access, writeFile } from "node:fs/promises";\n' +
      `import { queryProcessIdentity, observeOwnedProcessExit } from ${JSON.stringify(identityUri)};`],
    ['let runtime, server, runner, staged = false;', 'let runtime, server, runner, staged = false;\nconst launchRecords = [];\n' +
      'const recordLaunch = async (child, role) => {\n  const identity = await queryProcessIdentity(child.pid);\n' +
      '  assert.ok(identity && identity.parentPid === process.pid);\n  child.ownedIdentity = identity;\n' +
      '  launchRecords.push({ role, identity, absence: null });\n};'],
    ['  if (process.platform === "win32") {\n    await exec("taskkill.exe",',
      '  const current = await queryProcessIdentity(child.pid);\n' +
      '  if (!current) return;\n  assert.ok(child.ownedIdentity && current.parentPid === child.ownedIdentity.parentPid &&\n' +
      '    Math.abs(Date.parse(current.createdAt) - Date.parse(child.ownedIdentity.createdAt)) <= 1, "Never stop an unrelated or reused PID");\n' +
      '  if (process.platform === "win32") {\n    await exec("taskkill.exe",'],
    ['  const deadline = Date.now() + 30_000;', '  await recordLaunch(server, "production-server");\n  const deadline = Date.now() + 30_000;'],
    ['  await new Promise((resolve, reject) => {\n    const timer = setTimeout(',
      '  await recordLaunch(runner, "playwright-runner");\n  await new Promise((resolve, reject) => {\n    const timer = setTimeout('],
    ['  process.stdout.write("Private split MPEG2 helper trees stopped, generated assets restored, owned runtime scratch removed.\\n");',
      '  for (const row of launchRecords) {\n    row.absence = await observeOwnedProcessExit(row.identity);\n' +
      '    assert.equal(row.absence.status, "owned-identity-absent");\n  }\n' +
      `  await writeFile(path.join(root, ${JSON.stringify(launchPath)}), JSON.stringify({ launchRecords, runtime: runtime?.directory ?? null, runtimeAbsent: true }), { flag: "wx" });\n` +
      '  process.stdout.write("Private split MPEG2 helper trees stopped, generated assets restored, owned runtime scratch removed.\\n");'],
  ];
  const driver = replaceExactly(baseline.driver, driverPatches);
  assert.ok(spec.includes("headless: true") && !spec.includes("headless: false"));
  assert.equal((driver.match(/windowsHide: true/g) ?? []).length, 6);
  return { spec, driver, config: baseline.config, patches, driverPatches, stylesheetBinding, launchPath, historicMatrixCss: matrixCss,
    baselineSpecSha256: sha(baseline.spec), baselineDriverSha256: sha(baseline.driver) };
}

export function compareProgressCompositingUi(candidate, baseline, binding, baselineCssBytes, matrixCss) {
  const pick = (report, kind) => report.rows.filter(row => row.kind === kind);
  validateBinding(binding, /^\/assets\/[\w-]+\.css$/);
  assert.equal(baselineCssBytes.length, normalStylesheet.bytes); assert.equal(sha(baselineCssBytes), normalStylesheet.sha256);
  const matrixBytes = binding.matrixCssBytes; assert.ok(matrixBytes > 0 && matrixBytes < 4096);
  assert.equal(Buffer.byteLength(matrixCss), matrixBytes); assert.equal(sha(matrixCss), binding.matrixCssSha256);
  const baselineAfter = Buffer.concat([baselineCssBytes, Buffer.from(matrixCss)]);
  const styles = report => pick(report, "matrix-static-stylesheet");
  const aStyles = styles(candidate), bStyles = styles(baseline); assert.equal(aStyles.length, 5); assert.equal(bStyles.length, 5);
  for (const row of aStyles) {
    assert.equal(row.records.length, 1); const record = row.records[0];
    assert.equal(new URL(record.url).pathname, binding.url);
    assert.deepEqual({ bytes: record.beforeBytes, sha256: record.beforeSha256, afterBytes: record.afterBytes, afterSha256: record.afterSha256 },
      { bytes: binding.bytes, sha256: binding.sha256, afterBytes: binding.afterBytes, afterSha256: binding.afterSha256 });
    assert.equal(record.afterBytes - record.beforeBytes, matrixBytes);
  }
  for (const row of bStyles) {
    assert.equal(row.records.length, 1); const record = row.records[0];
    assert.equal(new URL(record.url).pathname, normalStylesheet.url);
    assert.equal(record.beforeBytes, normalStylesheet.bytes); assert.equal(record.beforeSha256, normalStylesheet.sha256);
    assert.equal(record.afterBytes - record.beforeBytes, matrixBytes);
    assert.equal(record.afterSha256, sha(baselineAfter));
  }
  // Same six-state layout gate; CSS is checked above, never spoofed to old hashes.
  const left = pick(candidate, "matrix-ui-observation"), right = pick(baseline, "matrix-ui-observation");
  assert.equal(left.length, 6); assert.equal(right.length, 6);
  const comparisons = []; let maximumDelta = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index], b = right[index];
    for (const field of ["viewport", "jobState", "observationPhase", "matrixCards", "matrixSha256"])
      assert.deepEqual(a[field], b[field], `${index}:${field}`);
    assert.equal(a.overflow, false); assert.equal(b.overflow, false); assert.equal(a.rows.length, b.rows.length);
    const deltas = a.rows.map((row, n) => {
      const other = b.rows[n]; assert.equal(row.selector, other.selector); assert.equal(row.display, other.display);
      const delta = Object.fromEntries(["x", "y", "width", "height"].map(field => {
        assert.ok(Number.isFinite(row[field]) && Number.isFinite(other[field]));
        const difference = Math.abs(row[field] - other[field]); maximumDelta = Math.max(maximumDelta, difference);
        return [field, difference];
      }));
      return { selector: row.selector, ...delta };
    });
    comparisons.push({ jobState: a.jobState, observationPhase: a.observationPhase, deltas });
  }
  return { matchingHeadlessGeometryAccepted: maximumDelta <= 1 / 64, cssIntentionallyChanged: true,
    actualCandidateCssBound: true, baselineCssBound: true, identicalHistoricPrivateMatrixCssRetained: true,
    toleranceCssPixels: 1 / 64, maximumDeltaCssPixels: maximumDelta, comparisons,
    scope: "Same headless1280x900/fixture/settings/six UI states; exact intentional CSS change; not speed/full-source memory acceptance" };
}
