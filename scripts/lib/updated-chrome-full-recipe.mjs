import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {exactPatch} from "./ebml-reuse-browser-components.mjs";
export function deriveUpdatedChromeFullDriver(source,root,wrapper,candidateName,extensionFiles,pin) {
  assert.equal(path.dirname(wrapper),path.join(root,"work"));assert.match(path.basename(wrapper),/^updated-chrome-full-wrapper-[A-Za-z0-9]+$/);
  assert.match(candidateName,/^allocation-attempt-media-[A-Za-z0-9]+$/);
  assert.ok(extensionFiles.length<=128&&new Set(extensionFiles).size===extensionFiles.length);
  const renamed=source.replaceAll("allocation-attempt-full-wrapper-fZzR1b",path.basename(wrapper))
    .replaceAll("allocation-attempt-media-o5s66Y",candidateName)
    .replaceAll("-private-mpeg2-threaded-validation-full-native-100ms","-private-mpeg2-updated-chrome-full-native-100ms");
  const stage=path.join(wrapper,"stage.mjs"),uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const oldSources=`const fullSourceFiles=[...executedParentSourceFiles,...validatorExtensionSourceFiles];
assert.equal(fullSourceFiles.length,714+validatorExtensionSourceFiles.length);`;
  const newSources=`const threadedParentSourceFiles=[...executedParentSourceFiles,...validatorExtensionSourceFiles];
assert.equal(threadedParentSourceFiles.length,726);
const updatedBrowserExtensionFiles=${JSON.stringify(extensionFiles)};assert.ok(updatedBrowserExtensionFiles.length<=128);
assert.ok(updatedBrowserExtensionFiles.every(file=>!threadedParentSourceFiles.includes(file)));
const fullSourceFiles=[...threadedParentSourceFiles,...updatedBrowserExtensionFiles];`;
  const journal=`const launchJournal=await createFullLaunchJournal({root,file:reportBase+'-launches.json',
  driverIdentity:await queryProcessIdentity(process.pid),wrapperDirectory:${JSON.stringify(wrapper)},candidateDirectory:candidate});`;
  return exactPatch(source,[[source,renamed],[oldSources,newSources],
    ['["scripts/stage-duration-drain-full.mjs", "stage"]',`[${JSON.stringify(stage)}, "stage"]`],
    ['["scripts/stage-duration-drain-full.mjs", "restore"]',`[${JSON.stringify(stage)}, "restore"]`],
    ['const ownedLaunches = [];',`import {createFullLaunchJournal} from ${JSON.stringify(uri("full-launch-journal.mjs"))};\nconst ownedLaunches = [];`],
    ['  child.ownedIdentity = identity; ownedLaunches.push({ role, identity });',
      '  child.ownedIdentity = identity; ownedLaunches.push({ role, identity });\n  await launchJournal.record(role,identity);'],
    ["try {\n  await verifySource();",journal+"\ntry {\n  await verifySource();"],
    ['  runtime = await createOwnedRuntimeScratch("allocation-attempt-full-runtime-");',
      '  runtime = await createOwnedRuntimeScratch("allocation-attempt-full-runtime-");\n  await launchJournal.setRuntime(runtime.directory);'],
    ['  browserVersion = browser.version(); context = browser.contexts()[0]; page = context.pages()[0];',
      `  browserVersion = browser.version(); assert.equal(browserVersion,${JSON.stringify(pin.version)}); context = browser.contexts()[0]; page = context.pages()[0];`],
    ['  progressProbe.chromeLibrarySha256 = await shaFile(path.join("C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application",browserVersion,"chrome.dll"));',
      '  progressProbe.chromeLibrarySha256 = await shaFile(path.join("C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application",browserVersion,"chrome.dll"));'+
      `\n  assert.equal(progressProbe.chromeLauncherSha256,${JSON.stringify(pin.launcher.sha256)});\n  assert.equal(progressProbe.chromeLibrarySha256,${JSON.stringify(pin.library.sha256)});`],
    ['  if (cleanupErrors.length) {','  await attempt(()=>launchJournal.finish());\n  if (cleanupErrors.length) {'],
  ]);
}
export function deriveUpdatedChromeFullStager(source,oldName,candidateName) {
  assert.match(oldName,/^packet-cache-media-[A-Za-z0-9]+$/);assert.match(candidateName,/^allocation-attempt-media-[A-Za-z0-9]+$/);
  const named=source.replaceAll(oldName,candidateName);assert.equal(named.replaceAll(candidateName,oldName),source);
  return exactPatch(source,[[source,named]]);
}
export function deriveUpdatedChromeSupervisor(source,root) {
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
  const named=relocated.replaceAll("scripts/launch-packet-largest-idle-supervisor.mjs","scripts/run-updated-chrome-full.mjs")
    .replaceAll("scripts/run-packet-largest-idle-original-full.mjs","scripts/run-updated-chrome-full.mjs")
    .replaceAll("packet-largest-idle-supervisor","updated-chrome-supervisor");
  return exactPatch(source,[[source,named],['const root = path.resolve(import.meta.dirname, ".."), own =',`const root = ${JSON.stringify(root)}, own =`],
    [`import { queryProcessIdentity } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/owned-process-exit-observation.mjs")).href)};`,
      `import {queryReliableProcessIdentity as queryProcessIdentity} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/reliable-owned-identity.mjs")).href)};`]]);
}
