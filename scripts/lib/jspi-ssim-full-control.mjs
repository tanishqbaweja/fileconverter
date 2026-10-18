import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectSsimSummary as oldParser } from "./bounded-ssim-summary.mjs";
import { inspectSsimSummary as newParser } from "./cr-aware-ssim-summary.mjs";
import { deriveJspiFullDriver, deriveJspiFullCaller, deriveJspiFullSupervisor } from "./jspi-full-control.mjs";
export const SSIM_FULL_FILES = ["scripts/lib/cr-aware-ssim-summary.mjs", "scripts/lib/retained-ssim-validator.mjs",
  "scripts/lib/jspi-ssim-full-control.mjs", "scripts/run-jspi-ssim-full.mjs", "scripts/inspect-jspi-ssim-preparation.mjs",
  "tests/cr-aware-ssim-summary.test.mjs", "tests/jspi-ssim-full-control.test.mjs"];
export async function loadSsimFramingQualification(root) {
  const read = file => readFile(path.join(root, file));
  const proofPath = "evidence/2026-10-19-ssim-cr-framing-native-v2.json", auditPath = "evidence/2026-10-19-jspi-full-failure-analysis.json";
  const proofBytes = await read(proofPath), auditBytes = await read(auditPath);
  assert.equal(sha(proofBytes), "a7f6b7f901879cbdba1b025a4cb7415e5872f4de1326d9ca71e564abbebf2d8c");
  assert.equal(sha(auditBytes), "0c636b857e7bceab1b1de253464c5c277e19f386832cd834d10ca0697de043d2");
  const proof = JSON.parse(proofBytes), audit = JSON.parse(auditBytes);
  const files = [proofPath, auditPath];
  for (const record of [proof, audit]) for (const [file, row] of Object.entries(record.ownSources)) {
    assert.equal(sha(Buffer.from(row.preimage, "base64")), row.sha256); assert.equal(sha(await read(file)), row.sha256, file); files.push(file);
  }
  assert.equal(audit.all855ExecutedCurrentPostPinsEqual, true); assert.equal(audit.analysis.fullOriginalAcceptance, false);
  assert.equal(proof.noOutputFile, true); assert.equal(proof.noUserMediaRead, true); assert.equal(proof.cases.length, 2);
  for (const row of proof.cases) {
    assert.deepEqual(oldParser(row.stderr), row.oldParser); assert.deepEqual(newParser(row.stderr), row.correctedParser);
    assert.equal(row.oldParser.status, "missing-summary"); assert.equal(row.correctedParser.status, "numeric-summary");
    assert.equal(row.correctedParser.score >= 0.98, !row.lowQuality);
    assert.equal(row.oldParser.stderrSha256, row.correctedParser.stderrSha256);
  }
  return { files, reference: { nativeFramingProof: { path: proofPath, sha256: sha(proofBytes) },
    priorFullFailureAudit: { path: auditPath, sha256: sha(auditBytes) }, qualityThreshold: 0.98,
    lowQualityNativeScore: proof.cases[1].correctedParser.score, browserCodecOrSettingsChanged: false, publicAcceptance: false } };
}
export async function deriveSsimJspiFullDriver(...args) {
  const parent = await deriveJspiFullDriver(...args), root = args[1], uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  return exactPatch(parent.generated, [
    [`import { inspectSsimSummary, requireNumericSsim } from ${JSON.stringify(uri("bounded-ssim-summary.mjs"))};`,
      `import { requireNumericSsim } from ${JSON.stringify(uri("bounded-ssim-summary.mjs"))};\nimport { inspectAndRetainSsim } from ${JSON.stringify(uri("retained-ssim-validator.mjs"))};\nimport { loadSsimFramingQualification } from ${JSON.stringify(uri("jspi-ssim-full-control.mjs"))};`],
    ['    const { stderr } = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",',
      '    run.preSsimOutput={outputBytes:(await stat(output)).size,sha256:await shaFile(output)};\n    const { stderr } = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",'],
    ['    run.independentSsimDiagnostic = inspectSsimSummary(stderr);',
      '    run.independentSsimDiagnostic = await inspectAndRetainSsim({root,reportBase,number,stderr,output:run.preSsimOutput});'],
    ['const fullQualification=await loadJspiFullQualification(root);',
      'const ssimQualification=await loadSsimFramingQualification(root);progressProbe.ssimFramingQualification=ssimQualification.reference;\nconst fullQualification=await loadJspiFullQualification(root);'],
  ]);
}
export function deriveSsimJspiFullSupervisor(source, root) {
  const parent = deriveJspiFullSupervisor(source, root);
  return exactPatch(parent.generated, [[parent.generated, parent.generated.replaceAll("scripts/run-jspi-full.mjs", "scripts/run-jspi-ssim-full.mjs")
    .replaceAll("jspi-full-supervisor", "jspi-ssim-full-supervisor")]]);
}
export async function deriveSsimJspiFullCaller(source, root) {
  const parent = await deriveJspiFullCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const named = parent.generated.replaceAll('${stamp}-jspi-full-', '${stamp}-jspi-ssim-full-')
    .replace('|jspi-full|paint-boundary-control', '|jspi-full|jspi-ssim-full|paint-boundary-control');
  return exactPatch(named, [
    [`import {deriveJspiFullDriver as deriveUpdatedChromeFullDriver,deriveJspiFullSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("jspi-full-control.mjs"))};`,
      `import {deriveSsimJspiFullDriver as deriveUpdatedChromeFullDriver,deriveSsimJspiFullSupervisor as deriveUpdatedChromeSupervisor,loadSsimFramingQualification} from ${JSON.stringify(uri("jspi-ssim-full-control.mjs"))};`],
    ['  const ownFiles=[', `  const ssimQualification=await loadSsimFramingQualification(root);\n  const ownFiles=[...ssimQualification.files,${SSIM_FULL_FILES.map(JSON.stringify).join(",")},`],
    ['    jspiFullQualification:fullQualification.reference,', '    ssimFramingQualification:ssimQualification.reference,jspiFullQualification:fullQualification.reference,'],
  ]);
}
