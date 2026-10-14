// Same conversion/validators/per-test60s. Fix SUITE watchdog budgeting and
// parent-finally ownership after actual180s watchdog killed fourth validation.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { reallocMediaSourceFiles,makeReallocMediaBrowserRecipe,makeReallocMediaCaller } from "./realloc-media-recipe.mjs";
export { inspectReallocMediaReport } from "./realloc-media-report-inspector.mjs";
function once(source,before,after) {assert.equal(source.split(before).length,2,before.slice(0,120));return source.replace(before,after);}
export async function journaledReallocMediaSourceFiles(root) {
  const files=[...new Set([...await reallocMediaSourceFiles(root),"scripts/lib/owned-media-fixture-journal.mjs","scripts/lib/journaled-realloc-media-recipe.mjs",
    "scripts/qualify-journaled-realloc-media.mjs","tests/journaled-realloc-media.test.mjs",
    "scripts/record-realloc-media-watchdog-failure.mjs","evidence/2026-10-14T08-57-06-152Z-realloc-media-watchdog-failure.json"])];
  assert.ok(files.length<=256);return files;
}
export async function makeJournaledReallocMediaBrowserRecipe(sources,root,runtime,stamp,branch,build) {
  const old=await makeReallocMediaBrowserRecipe(sources,root,runtime,stamp,branch,build);
  const journal=path.join(runtime,"owned-fixture.json"),url=pathToFileURL(path.join(root,"scripts/lib/owned-media-fixture-journal.mjs")).href;
  const cleanupPath=`outputs/reports/${stamp}-journaled-realloc-fixture-cleanup.json`;
  const specEdits=[
    ['import { expect, test } from "@playwright/test";',`import { expect, test } from "@playwright/test";\nimport { registerOwnedMediaFixture } from ${JSON.stringify(url)};`],
    ['work = await mkdtemp(path.join(root, "work/mpeg2-artwork-validation-"));',
      `work = await mkdtemp(path.join(root, "work/mpeg2-artwork-validation-"));\n  await registerOwnedMediaFixture(root,work,${JSON.stringify(journal)});`],
  ];
  const driverEdits=[
    ['import assert from "node:assert/strict";',`import assert from "node:assert/strict";\nimport { retireOwnedMediaFixtureJournal } from ${JSON.stringify(url)};`],
    [')), 180_000);',')), 300_000);'],
    ['  // Restoration spawns a Node child using this scratch.',`  // Reclaim registered disposable fixtures even when runner hooks were interrupted.
  // Never delete until exact owned runner birth is independently absent.
  try {
    const fixtureCleanup=await retireOwnedMediaFixtureJournal(root,${JSON.stringify(journal)},{runnerIdentity:runner?.ownedIdentity});
    await writeFile(path.join(root,${JSON.stringify(cleanupPath)}),JSON.stringify(fixtureCleanup,null,2)+"\\n",{flag:"wx"});
  } catch(error) { process.stderr.write(String(error)+"\\n");process.exitCode=1; }
  // Restoration spawns a Node child using this scratch.`],
  ];
  const patch=(source,edits)=>{let result=source;for(const [before,after] of edits)result=once(result,before,after);
    let reverse=result;for(const [before,after] of edits.toReversed())reverse=once(reverse,after,before);assert.equal(reverse,source);return result;};
  // Four sequential60s tests + bounded hooks/validation require a suite budget.
  // Individual/UI/quality/memory/IO thresholds stay unchanged; not speed proof.
  const config=once(old.config,'"timeout":60000,','"timeout":60000,"globalTimeout":270000,');
  return {...old,spec:patch(old.spec,specEdits),driver:patch(old.driver,driverEdits),config,
    journaledFixture:{journal,cleanupPath,registrationBeforeFixtureGeneration:true,reclaimOnlyAfterOwnedRunnerBirthAbsent:true},
    infrastructureTimeout:{previousSuiteWatchdogMs:180000,suiteWatchdogMs:300000,playwrightGlobalTimeoutMs:270000,individualTestTimeoutMs:60000,
      reason:"Four sequential tests plus native fixture/independent-validation/hooks; prevent premature kill of fourth validation",conversionAcceptanceThresholdsChanged:false},
    fixtureJournalSpecEdits:specEdits,fixtureJournalDriverEdits:driverEdits,publicAcceptance:false};
}
export function makeJournaledReallocMediaCaller(source,root) {
  const old=makeReallocMediaCaller(source,root),oldUrl=pathToFileURL(path.join(root,"scripts/lib/realloc-media-recipe.mjs")).href,
    newUrl=pathToFileURL(path.join(root,"scripts/lib/journaled-realloc-media-recipe.mjs")).href;
  let generated=once(old.generated,`import { makeReallocMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectReallocMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(oldUrl)};`,
    `import { makeJournaledReallocMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectReallocMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(newUrl)};`);
  generated=once(generated,`import { reallocMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(oldUrl)};`,
    `import { journaledReallocMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(newUrl)};`);
  generated=generated.replaceAll("${stamp}-realloc-media","${stamp}-journaled-realloc-media");
  return {generated,generatedSha256:sha(generated),previousCallerSha256:old.generatedSha256};
}
