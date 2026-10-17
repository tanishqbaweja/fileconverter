import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";

export const COMPLETED_SAVE_SPEC_SHA = "73ba163e41f0eec3965aa7b67bc1d368621e1eb7c9e6fefbc9fad30ac0eb50eb";

// Reuse every independent validation assertion. Match the full driver's native
// disk-file picker bypass: URL-connected Playwright setInputFiles reads/base64
// reconstructs the entire fixture and contaminates Chromium memory measurement.
export function deriveCompletedSaveModule(spec, root) {
  assert.equal(sha(spec), COMPLETED_SAVE_SPEC_SHA);
  const uri = file => pathToFileURL(path.join(root, file)).href;
  let imports = spec.slice(0, spec.indexOf("const bitrateAuditSamples"));
  imports = imports.replace('from "@playwright/test"', `from ${JSON.stringify(uri("node_modules/@playwright/test/index.mjs"))}`);
  const helpers = spec.slice(spec.indexOf("async function native("), spec.indexOf("async function sampleTree("));
  const boundedHelpers = helpers.replace('return exec(executable, args,',
    'return exec(executable === "ffmpeg" ? "C:/ffmpeg/bin/ffmpeg.exe" : executable === "ffprobe" ? "C:/ffmpeg/bin/ffprobe.exe" : executable, args,');
  assert.notEqual(boundedHelpers, helpers);
  const originalValidator = spec.slice(spec.indexOf("async function validateConversion("), spec.indexOf("async function recoverOnSamePage("));
  const pickerAdapter = `      const fixtureInput=await page.context().newCDPSession(page);
      try{
        const document=await fixtureInput.send("DOM.getDocument");
        const {nodeId}=await fixtureInput.send("DOM.querySelector",{nodeId:document.root.nodeId,selector:'[data-testid="file-input"]'});
        expect(nodeId).toBeGreaterThan(0);
        await fixtureInput.send("DOM.setFileInputFiles",{nodeId,files:[source]});
      }finally{await fixtureInput.detach();}`;
  const validatorRecipe = exactPatch(originalValidator, [
    ['      await page.locator(\'[data-testid="file-input"]\').setInputFiles(source);', pickerAdapter],
  ]);
  const validator = validatorRecipe.generated;
  assert.ok(validator.includes('expect(ordinalSsim).toBeGreaterThanOrEqual(0.98)'));
  let fixture = spec.slice(spec.indexOf('  const metadata = path.join(work, "chapters.ffmetadata");'),
    spec.indexOf("  // Separate synthetic safety fixture"));
  fixture = fixture.replace('  fixtures.push({ ...fixtures[1], name: "cancel", seconds: 12 });',
    '  fixtures.splice(0,1); // Only qualified96-frameHEVC fixture; no unrelated controls.');
  assert.ok(!fixture.includes("fixtures.push"));
  const source = `${imports}
import {createOwnedRuntimeScratch} from ${JSON.stringify(uri("scripts/lib/owned-runtime-scratch.mjs"))};
const root=${JSON.stringify(root)},exec=promisify(execFile),expectedMemoryBytes=50331648,experimentBitRate=4000000;
const title="MPEG-2 café — 音楽";
const adapters=[{container:"mp4",source:"mkv",fixture:"hevc",sourceCodec:"hevc",frames:96,profile:"mkv-to-mp4",destination:"direct"}] as const;
const rows:Array<Record<string,unknown>>=[],bitrateAuditSamples:Array<Record<string,unknown>>=[],
  splitFinalSamples:Array<Record<string,any>>=[],asyncifyStorageSamples:Array<Record<string,any>>=[],
  inputReadFailureSamples:Array<Record<string,unknown>>=[],stackReserveSamples:Array<Record<string,unknown>>=[];
let work:string;
${boundedHelpers}
${validator}
export async function prepareCompletedSaveControl(){
  const owned=await createOwnedRuntimeScratch("completed-save-fixture-");work=owned.directory;
  let validated=0;
  try{
${fixture}
  }catch(error){await owned.close();throw error;}
  const report=()=>({scope:"one-small-complete-production-conversion-and-successful-final-save-handoff-only",
    fixtureDirectory:work,successfulFixtureValidations:validated,rows:[...rows],
    fullOriginalAcceptance:false,publicAcceptance:false,physicalWorkerMemoryReleaseProven:false});
  return {report,
    async run(page:import("@playwright/test").Page){
      const capture=(message:import("@playwright/test").ConsoleMessage)=>{
        const text=message.text();
        for(const [prefix,records] of [["WITHIN_MPEG2_BITRATE_AUDIT ",bitrateAuditSamples],
          ["WITHIN_MPEG2_SPLIT_FINAL ",splitFinalSamples],["WITHIN_ASYNCIFY_STORAGE_FINAL ",asyncifyStorageSamples],
          ["WITHIN_INPUT_READ_FAILURE ",inputReadFailureSamples],["WITHIN_MPEG2_STACK_RESERVE ",stackReserveSamples]] as const){
          if(text.startsWith(prefix)){expect(text.length).toBeLessThanOrEqual(2048);expect(records.length).toBeLessThan(16);
            records.push(JSON.parse(text.slice(prefix.length)));}
        }
      };
      page.on("console",capture);
      try{await validateConversion(page,adapters[0],false);validated=1;return report();}
      finally{page.off("console",capture);}
    },
    async close(){await owned.close();return {fixtureDirectory:work,removed:true};}
  };
}
`;
  return { source, validatorSha256: sha(validator), originalValidatorSha256: sha(originalValidator),
    validatorEdits: validatorRecipe.edits, sourceSha256: sha(source), fixtureGenerationOnly: true,
    originalInputChanged: false, publicAcceptance: false };
}

export async function prepareCompletedSaveControl(root, reportBase) {
  assert.equal(path.resolve(root), path.resolve(import.meta.dirname, "../.."));
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json")));
  const zip = await readFile(path.join(root, proof.sourceArchive.path));
  assert.equal(sha(zip), proof.sourceArchive.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.sourceArchive.restoredSha256);
  const recipe = deriveCompletedSaveModule(JSON.parse(raw).recipe.generated.spec, root);
  const javascript = (await transform(recipe.source, { loader: "ts", format: "esm", target: "es2022" })).code;
  const archived = gzipSync(Buffer.from(javascript), { level: 9 });
  const archivePath = reportBase + "-completed-save-module.mjs.gz";
  await writeFile(archivePath, archived, { flag: "wx" });
  const provenance = { qualifiedSpecSha256: COMPLETED_SAVE_SPEC_SHA, validatorSha256: recipe.validatorSha256,
    originalValidatorSha256: recipe.originalValidatorSha256, validatorEdits: recipe.validatorEdits,
    nativeDiskFilePickerBypass:true,validationAssertionsChanged:false,
    generatedTypescriptSha256: recipe.sourceSha256, generatedJavascriptSha256: sha(javascript), esbuildVersion,
    archive: { path: path.relative(root, archivePath).replaceAll(path.sep, "/"), bytes: archived.length, sha256: sha(archived),
      restoredBytes: Buffer.byteLength(javascript), restoredSha256: sha(javascript) } };
  const generatedControl = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
  const control = await generatedControl.prepareCompletedSaveControl();
  return { ...control, report: () => ({ ...control.report(), provenance }) };
}
