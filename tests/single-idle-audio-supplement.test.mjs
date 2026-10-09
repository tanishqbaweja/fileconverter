import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeSingleIdleAudioSupplement, SINGLE_IDLE_LIVE_RECEIPT, SINGLE_IDLE_AUDIO_RUNTIME, singleIdleAudioFiles } from "../scripts/lib/single-idle-audio-supplement-recipe.mjs";
import { closedOutputProbe, isFinalOutputDecode } from "../scripts/lib/closed-original-output-probe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const source = (await read("scripts/watch-original-audio-supplement.mjs")).toString();
const live = JSON.parse(await read(SINGLE_IDLE_LIVE_RECEIPT));
const recipe = makeSingleIdleAudioSupplement(source, root, live, SINGLE_IDLE_AUDIO_RUNTIME);
const executed = JSON.parse(gunzipSync(await read(live.sourceArchive.path), { maxOutputLength: 8388608 }));
test("Guarded watcher derives reversibly from the preserved old supplement without relaxing its safe window or audio bounds", () => {
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source);
  for (const token of ["closedOutputProbe(child.commandLine)", "isFinalOutputDecode(entry.commandLine, output)", "controller.abort()",
    "await guard", "signal: controller.signal", "maximumMs: 15 * 60 * 1000", "await delay(10000)", "await delay(1000)",
    "ordinal < sourceAudioCount", "assert.deepEqual(run.after, before)", "await verifySource()", "await runtime.close()", "ownedNativeReadersAbsent"])
    assert.ok(recipe.generated.includes(token), token);
  for (const token of ["chromium.launch", "connectOverCDP", "page.evaluate", "emptyOpfs(", "unlink(", "copyFile(", "stage-mpeg2"])
    assert.ok(!recipe.generated.includes(token), token);
  assert.equal(recipe.browserConversionsStarted, 0); assert.equal(recipe.generatedMediaCopies, 0); assert.equal(recipe.publicAcceptance, false);
});
test("Current driver body is attested at watcher startup and its parent/birth/path/headless profile are pinned", () => {
  for (const token of [live.sourceArchive.driverSha256, JSON.stringify(recipe.driverFile), `driver.parentPid, ${live.driverIdentity.parentPid}`,
    JSON.stringify(live.driverIdentity.createdAt), '"--headless=new"', "Exactly one owned Chromium profile required", JSON.stringify(SINGLE_IDLE_AUDIO_RUNTIME)])
    assert.ok(recipe.generated.includes(token), token);
  for (const file of singleIdleAudioFiles) assert.ok(recipe.generated.includes(JSON.stringify(file)), file);
  assert.throws(() => makeSingleIdleAudioSupplement(source + "\n", root, live, SINGLE_IDLE_AUDIO_RUNTIME));
  assert.throws(() => makeSingleIdleAudioSupplement(source, root, live, "../profile"));
  const bad = structuredClone(live); bad.sourceArchive.driverSha256 = "0".repeat(64);
  assert.throws(() => makeSingleIdleAudioSupplement(source, root, bad, SINGLE_IDLE_AUDIO_RUNTIME));
});
test("Exact current full driver closes all output ownership and only then starts the recognized full-count probe", () => {
  const driver = executed.generated;
  const marker = "const output = await outputPayload(metrics.outputBytes), after = await probe(output, true);";
  assert.ok(driver.indexOf('assert.equal(ownership.closed, true)') < driver.indexOf(marker));
  assert.ok(driver.indexOf(marker) < driver.indexOf('await native(["-v", "error", "-xerror", "-i", output'));
  assert.ok(driver.includes('...(count ? ["-count_frames"] : [])'));
  assert.ok(driver.includes('"-show_streams", "-show_format", "-show_chapters", "-of", "json", file'));
  const file = path.join(root, "work", SINGLE_IDLE_AUDIO_RUNTIME, "profile", "unit-closed-output");
  const probe = `ffprobe.exe -v error -count_frames -show_streams -show_format -show_chapters -of json "${file}"`;
  assert.equal(closedOutputProbe(probe), file); assert.equal(closedOutputProbe(probe.replace("-count_frames ", "")), null);
  assert.ok(isFinalOutputDecode(`ffmpeg.exe -v error -xerror -i "${file}" -map 0:v -map 0:a -f null -`, file));
  assert.ok(!isFinalOutputDecode(`ffmpeg.exe -v error -i "${file}" -map 0:a -f null -`, file));
});
test("Derived watcher parses without starting any browser, conversion or native media reader", () => {
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
});
test("Attachment wrapper guards existing watcher and driver identities, keeps scratch local and never restarts or rebuilds", async () => {
  const controller = (await read("scripts/watch-single-idle-audio-supplement.mjs")).toString();
  for (const token of ["A same-run audio watcher is already live", "queryProcessIdentity(live.driverIdentity.pid)",
    "all203OriginalSourcePinsUnchanged", "same original owner", "inspectStressHostMemory", "windowsHide: true", "await done", "await runtime.close()"])
    assert.ok(controller.toLowerCase().includes(token.toLowerCase()), token);
  for (const token of ["child.kill", "stage-mpeg2", "vinext", "chromium.launch", "emptyOpfs", "copyFile", "rm("])
    assert.ok(!controller.includes(token), token);
  assert.ok(!recipe.generated.includes('"scripts/mpeg2-static-ui-original-memory.mjs");'));
});
