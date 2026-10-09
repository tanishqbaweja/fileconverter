// Reuse the previously controlled, cancellable READ-ONLY supplement. No new converter.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EXECUTED_SINGLE_IDLE_FULL_SHA } from "./full-copied-audio-gate-recipe.mjs";
export const ORIGINAL_AUDIO_SUPPLEMENT_SHA = "60de2291f44e7b4e8be124ac230a40d232ca45dac406f167d7b3fc6cbe09e72b";
export const SINGLE_IDLE_LIVE_RECEIPT = "evidence/2026-10-09T20-55-24-319Z-single-idle-full-live.json";
export const SINGLE_IDLE_AUDIO_RUNTIME = "mpeg2-single-idle-full-runtime-UnvbTZ";
export const singleIdleAudioFiles = Object.freeze([
  "scripts/watch-single-idle-audio-supplement.mjs", "scripts/lib/single-idle-audio-supplement-recipe.mjs",
  "tests/single-idle-audio-supplement.test.mjs", "scripts/lib/full-copied-audio-gate-recipe.mjs",
]);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function makeSingleIdleAudioSupplement(source, root, live, runtimeName) {
  assert.equal(sha(source), ORIGINAL_AUDIO_SUPPLEMENT_SHA);
  assert.equal(live.status, "actual-changed-full-driver-launched-not-acceptance");
  assert.equal(live.sourceArchive.driverSha256, EXECUTED_SINGLE_IDLE_FULL_SHA);
  assert.equal(live.sourceArchive.preimageCount, 203);
  assert.ok(path.isAbsolute(root)); assert.equal(path.dirname(live.wrapper), path.join(root, "work"));
  assert.match(path.basename(live.wrapper), /^single-idle-full-wrapper-[a-zA-Z0-9]{6}$/);
  assert.equal(runtimeName, SINGLE_IDLE_AUDIO_RUNTIME);
  assert.ok(Number.isSafeInteger(live.driverIdentity.pid) && live.driverIdentity.pid > 0);
  assert.ok(Number.isSafeInteger(live.driverIdentity.parentPid) && live.driverIdentity.parentPid > 0);
  assert.match(live.driverIdentity.createdAt, /^20[0-9-]{8}T[0-9:.]{16}Z$/);
  const driverFile = path.join(live.wrapper, "probe.mjs");
  const edits = [];
  for (const relative of ["abortable-audio-validator-recipe.mjs", "closed-original-output-probe.mjs", "owned-runtime-scratch.mjs"])
    edits.push([JSON.stringify("./lib/" + relative), JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", relative)).href)]);
  edits.push(
    ['const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);',
      `const root = ${JSON.stringify(root)}, execute = promisify(execFile);`],
    ['assert.match(runtimeName, /^mpeg2-static-ui-original-runtime-[a-zA-Z0-9]{6}$/);',
      `assert.equal(runtimeName, ${JSON.stringify(runtimeName)});\nassert.equal(driverPid, ${live.driverIdentity.pid});\nassert.equal(driverBornUtc, ${JSON.stringify(live.driverIdentity.createdAt)});`],
    ['assert.equal(args[1], "scripts/mpeg2-static-ui-original-memory.mjs");',
      `assert.equal(args[1], ${JSON.stringify(driverFile)});\n  assert.equal(driver.parentPid, ${live.driverIdentity.parentPid});`],
    ['assert.ok(await snapshot(), "The original driver must actually be live before attaching");',
      `assert.equal(sha(await readFile(${JSON.stringify(driverFile)})), ${JSON.stringify(EXECUTED_SINGLE_IDLE_FULL_SHA)});\n  const initial = await snapshot();\n  assert.ok(initial, "The original driver must actually be live before attaching");\n  const chrome = initial.children.filter(child => child.name?.toLowerCase() === "chrome.exe" &&\n    simpleWindowsNativeArguments(child.commandLine).includes("--user-data-dir=" + profile));\n  assert.equal(chrome.length, 1, "Exactly one owned Chromium profile required");\n  assert.ok(simpleWindowsNativeArguments(chrome[0].commandLine).includes("--headless=new"));`],
    ['for (const file of ["scripts/watch-original-audio-supplement.mjs",',
      'for (const file of [' + singleIdleAudioFiles.map(file => JSON.stringify(file) + ',').join('') + '"scripts/watch-original-audio-supplement.mjs",'],
    ['-original-audio-supplement.json`', '-single-idle-audio-supplement.json`'],
  );
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only imports/current owner bindings/startup attestation/source pins/report name change; original window/cancellation/fidelity/cleanup gates stay identical");
  return { generated, generatedSha256: sha(generated), edits, driverFile, baseSha256: ORIGINAL_AUDIO_SUPPLEMENT_SHA,
    browserConversionsStarted: 0, generatedMediaCopies: 0, applicationOrEngineChanged: false,
    publicAcceptance: false };
}
