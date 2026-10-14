// Independent receipt/native/source/output/birth/cleanup checks. No conversion.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const witnessPath = "evidence/2026-10-14T22-17-16-644Z-mvf-arena-browser-control-executed-sources.json";
process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT = witnessPath;
const sourcePath = "scripts/verify-installed-chrome-realloc-qualification.mjs", source = (await read(sourcePath)).toString();
assert.equal(sha(source), "28f8cc840ed33d4d62d7bd2d63748259f1d0b4cb08886348137f59d06b1707d3");
const extraChecks = `const supplementalPath="evidence/2026-10-14T22-20-42-722Z-mvf-arena-media-supplement.json";
const supplementalBytes=await read(supplementalPath), supplemental=JSON.parse(supplementalBytes);
assert.equal(supplemental.failure,null);assert.equal(supplemental.prepareOnly,false);assert.equal(supplemental.ownedCallerAbsent,true);
assert.deepEqual(supplemental.sourcePins,supplemental.postSourcePins);assert.equal(Object.keys(supplemental.sourcePins).length,42);
assert.equal(supplemental.distinctTotalFiles,297);assert.equal(supplemental.supplemental.maximumFiles,128);
assert.equal(supplemental.supplemental.maximumRestoredBytes,2097152);assert.equal(supplemental.legacy.maximumFiles,256);
assert.equal(supplemental.legacy.maximumRestoredBytes,8388608);
const supplementalArchive=JSON.parse(await restore(supplemental.archive,2097152));assert.deepEqual(supplementalArchive.sourcePins,supplemental.sourcePins);
for(const [file,hash]of Object.entries(supplemental.sourcePins)){assert.equal(sha(Buffer.from(supplementalArchive.preimages[file],"base64")),hash);assert.equal(sha(await read(file)),hash);}
assert.equal(new Set([...Object.keys(media.sourcePins),...Object.keys(supplemental.sourcePins)]).size,297);
assert.equal(witness.sourceSealScopes.distinctTotalFiles,135);
assert.equal(sha(controlArchive.componentsRecipe.generated),controlArchive.componentsRecipe.generatedSha256);
assert.equal(typeof controlArchive.executedCallerSource,"string");assert.equal(typeof supplementalArchive.executedQualifierSource,"string");
`;
const nativeUrl = pathToFileURL(path.join(root, "scripts/lib/mvf-arena-browser-components.mjs")).href;
const edits = [
  ['const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),stamp="2026-10-14T15-36-28-196Z";',
    `const root=${JSON.stringify(root)},read=file=>readFile(path.join(root,file)),stamp="2026-10-14T22-20-42-730Z";`],
  ['import { inspectReallocMediaReport } from "./lib/realloc-media-report-inspector.mjs";',
    `import { inspectEbmlMediaReport as inspectReallocMediaReport } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/mvf-arena-media-recipe.mjs")).href)};`],
  ['import { verifyReallocNativeEnvelope } from "./lib/realloc-native-envelope.mjs";',
    `import { loadMvfBrowserComponents } from ${JSON.stringify(nativeUrl)};
const { verifyEbmlNative }=await loadMvfBrowserComponents(${JSON.stringify(root)});
const verifyReallocNativeEnvelope=async(root,build,buildBytes,branch)=>{const actual=await verifyEbmlNative(root);assert.deepEqual(build,actual.build);assert.equal(sha(buildBytes),sha(actual.buildBytes));assert.deepEqual(branch,actual.branch);return actual.envelope;};`],
  ['"evidence/2026-10-14T15-33-36-401Z-installed-chrome-realloc-control-executed-sources.json"', JSON.stringify(witnessPath)],
  ['[[witness,controlArchive,125],[media,mediaArchive,255]]', '[[witness,controlArchive,38],[media,mediaArchive,255]]'],
  ['const proofBytes=await read(witness.proof.path)', extraChecks + 'const proofBytes=await read(witness.proof.path)'],
  ['"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c"', '"2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576"'],
  ['evidence/mpeg2-realloc-attempt-build-38526781934.json', 'evidence/mpeg2-mvf-arena-build-38643550000.json'],
  ['evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json', 'evidence/mpeg2-mvf-arena-build-branch-2026-10-15-smoke-warnings.json'],
  ['const analysis=inspectReallocMediaReport(', 'const analysis=await inspectReallocMediaReport('],
  ['mediaArchive.generated.actualControlWitness', 'mediaArchive.generated.actualEbmlControlWitness'],
  ['packet-cache-media-MbROAx-direct-artwork', 'packet-cache-media-PXYXY2-direct-artwork'],
  ['own="scripts/verify-installed-chrome-realloc-qualification.mjs"', 'own="scripts/verify-mvf-arena-media.mjs"'],
  ['sourceCounts:{control:125,media:255}', 'sourceCounts:{control:38,native:99,totalControl:135,mediaLegacy:255,mediaSupplemental:42,totalMedia:297}'],
  ['sourceArchives:{control:witness.archive,media:media.generatedArchive}', 'sourceArchives:{control:witness.archive,media:media.generatedArchive,supplemental:supplemental.archive}'],
  ['sourceCapsChanged:false', 'sourceCapsChanged:false,sourceCapsScope:"per-independent-seal-not-single-total256",supplementalSourcePins:supplemental.sourcePins'],
];
const recipe = exactPatch(source, edits);
let generated = recipe.generated.replaceAll("${stamp}-installed-chrome-realloc-media", "${stamp}-mvf-arena-media")
  .replaceAll("${stamp}-installed-chrome-realloc-independent-qualification", "${stamp}-mvf-arena-independent-qualification");
generated = generated.replace(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm, (match, file) =>
  match.replace(`from "${file}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`));
const runtime = await createOwnedRuntimeScratch("mvf-arena-independent-seal-");
try { const file = path.join(runtime.directory, "verify.mjs"); await writeFile(file, generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const output = "evidence/2026-10-14T22-20-42-730Z-mvf-arena-independent-executed-source.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), sourcePath, sourceSha256: sha(source), sourcePreimage: Buffer.from(source).toString("base64"),
  generatedSource: generated, generatedSha256: sha(generated), recipe, ownedRuntimeRemoved: true, originalAcceptance: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));
