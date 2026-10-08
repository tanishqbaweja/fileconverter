// Same five production conversion/independent-validator/recovery tests, new core.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
const root = path.resolve(import.meta.dirname, "..");
const proofPath = path.join(root,"evidence/mpeg2-late-abort-goldens-2026-10-08.json");
await assert.rejects(access(proofPath),{code:"ENOENT"});
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportsRoot = path.join(root,"output/playwright"), beforeReports = new Set(await readdir(reportsRoot));
const sourcePins = {};
for(const file of ["scripts/validate-mpeg2-late-abort-goldens.mjs","scripts/stage-mpeg2-late-abort.mjs",
  "scripts/lib/mpeg2-late-abort-adapter.mjs","scripts/lib/late-pool-abort-capture.mjs",
  "scripts/lib/late-refstruct-abort-snapshot.mjs","scripts/lib/bounded-wasm-abort-capture.mjs",
  "scripts/validate-mpeg2-split-direct.mjs","tests/browser/mpeg2-split-direct-candidate.spec.ts","app/converter/ConverterApp.tsx"])
  sourcePins[file] = sha(await readFile(path.join(root,file)));
const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true, "Keep2GiB guard");
const source = await readFile(path.join(root, "scripts/validate-mpeg2-split-direct.mjs"), "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "b4cb70a6977f664337e6c80e8f296f58d2f50297b599e96a21cff91b84d0a9c4");
const runtime = await createOwnedRuntimeScratch("mpeg2-late-goldens-driver-");
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), exec =', `const root = ${JSON.stringify(root)}, exec =`],
  ['"mpeg2-split-direct-runtime-"', '"mpeg2-late-goldens-runtime-"'],
  ['"scripts/stage-mpeg2-split-direct.mjs"', '"scripts/stage-mpeg2-late-abort.mjs"'],
  ['{ ...runtime.env, WRANGLER_SEND_METRICS: "false",', '{ ...runtime.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738", WRANGLER_SEND_METRICS: "false",'],
  ['"tests/browser/mpeg2-split-direct-candidate.spec.ts", "--reporter=line"',
    '"tests/browser/mpeg2-split-direct-candidate.spec.ts", "--reporter=line", "--output=" + path.join(runtime.directory,"artifacts")'],
  ['  await finishOwnedCleanup([() => stop(runner), () => stop(server)]);',
    '  try { await finishOwnedCleanup([() => stop(runner), () => stop(server)]); }\n  catch(error) { process.stderr.write(String(error)+"\\n"); process.exitCode=1; }'],
  ['{ cwd: root, env: runtime?.env, windowsHide: true });',
    '{ cwd: root, env: { ...runtime?.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: "mpeg2-split-pipeline-37739125738" }, windowsHide: true });'],
];
let generated = source;
for (const [before, after] of patches) {
  assert.ok(generated.includes(before)); generated = generated.replaceAll(before, after);
}
let reverse = generated;
for (const [before, after] of patches.toReversed()) reverse = reverse.replaceAll(after, before);
assert.equal(reverse, source, "Same five conversions/quality/timing/audio/artwork/metadata/cleanup assertions");
generated = generated.replace('from "./lib/owned-runtime-scratch.mjs"',
  `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/owned-runtime-scratch.mjs")).href)}`);
let failure = null;
try {
  const target = path.join(runtime.directory, "goldens.mjs"); await writeFile(target, generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} catch(error) { failure = String(error).slice(0,2048); process.exitCode=1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory),{code:"ENOENT"}); }
const reports = [];
for(const file of (await readdir(reportsRoot)).filter(file=>!beforeReports.has(file)&&file.endsWith("-mpeg2-split-pipeline-37739125738-direct-artwork.json"))) {
  const bytes = await readFile(path.join(reportsRoot,file));assert.ok(bytes.length<=2*1048576);
  reports.push({path:"output/playwright/"+file,bytes:bytes.length,sha256:sha(bytes),report:JSON.parse(bytes)});
}
const postSourcePins = {};
for(const file of Object.keys(sourcePins)) postSourcePins[file]=sha(await readFile(path.join(root,file)));
const pinsUnchanged = JSON.stringify(sourcePins)===JSON.stringify(postSourcePins);
const passed = !failure && !process.exitCode && pinsUnchanged && reports.length===1;
await writeFile(proofPath,JSON.stringify({recordedAt:new Date().toISOString(),status:passed?"browser-suite-returned-success-awaiting-independent-golden-freeze":"failed-or-incomplete",
  failure,hostPreflight:host,sourcePins,postSourcePins,pinsUnchanged,reports,
  ownedDriver:runtime.directory,ownedDriverRemoved:true,
  compiledCoreSha256:"3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c",
  syntheticExportControlStaged:false,protectedOriginalRead:false,nativeConverterUsed:false,noDocker:true,
  completeChromiumMemoryAcceptance:false,originalFullSourceAcceptance:false,publicAcceptance:false},null,2)+"\n",{flag:"wx"});
assert.ok(passed,"Keep failed proof, diagnose before any retry");
