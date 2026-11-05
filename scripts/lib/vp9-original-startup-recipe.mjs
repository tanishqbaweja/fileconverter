// Exact reversible derivation from the retained strict small-control source.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVp9OriginalStartupSource(source, root) {
  assert.ok(path.isAbsolute(root)); const edits = [];
  const add = (before, after) => { assert.equal(source.split(before).length, 2, before.slice(0, 160)); edits.push([before, after]); source = source.replace(before, after); };
  const parentSha256 = sha(source), helper = pathToFileURL(path.join(root, "scripts/lib/vp9-original-startup.mjs")).href;
  add('import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { runVp9OriginalStartup } from ' + JSON.stringify(helper) + ';');
  add('"scripts/lib/private-vp9-finalization.mjs",', '"scripts/lib/private-vp9-finalization.mjs", "scripts/lib/vp9-original-startup.mjs", "scripts/lib/vp9-original-startup-recipe.mjs",');
  add('evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269.json', 'evidence/2026-11-06-vp9-original-cpu-startup.json');
  add('2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269-failure.zip', '2026-11-06-vp9-original-cpu-startup-failure.zip');
  add('  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);',
    '  const disk = await statfs(root); report.diskPreflight = { freeBytes: disk.bavail * disk.bsize, minimumBytes: 2147483648 };\n' +
    '  assert.ok(report.diskPreflight.freeBytes >= report.diskPreflight.minimumBytes);');
  add('scope: "One genuine private VP9 small-worker OPFS conversion with native validation; NOT full production UI, direct picker, A/B speed or original/near10GB qualification",',
    'scope: "Untouched full original input, explicit CPU1920x804/24fps/6Mbps five-minute startup safety gate; NOT completed full-file conversion/fidelity/public acceptance",');
  const fixtureStart = source.indexOf('  const fixture = path.join(runtime.directory, "explicit-bt709.mkv"),'), fixtureEnd = source.indexOf('  await assert.rejects(access(stage)', fixtureStart);
  assert.ok(fixtureStart > 0 && fixtureEnd > fixtureStart);
  const fixtures = source.slice(fixtureStart, fixtureEnd);
  add(fixtures, '  const fixture = path.join(root, "test.mkv");\n' +
    '  const ffprobe = "C:/ffmpeg/bin/ffprobe.exe";\n' +
    '  report.sourceProbe = JSON.parse((await execute(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixture],\n' +
    '    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout);\n' +
    '  const video = report.sourceProbe.streams.filter(row => row.codec_type === "video" && !row.disposition?.attached_pic);\n' +
    '  assert.equal(video.length, 1); assert.deepEqual([video[0].codec_name, video[0].width, video[0].height, video[0].avg_frame_rate], ["hevc", 1920, 804, "24/1"]);\n' +
    '  report.fixture = { path: "test.mkv", ...report.originalBefore, protectedOriginal: true, generated: false, copied: false, truncated: false };\n');
  add('  report.baselineAdjusted = false; report.baselineAvailable = report.blankBaseline?.stable === true;\n' +
    '  if (!report.baselineAvailable) report.failures.push("Earliest stable blank baseline unavailable; collect functional facts, retain overall failure and null incremental memory");',
    '  assert.equal(report.blankBaseline?.stable, true, "Stable blank required before the long original startup; no baseline extension or adjustment");\n' +
    '  report.baselineAdjusted = false; report.baselineAvailable = true;');
  const start = source.indexOf('  outputFile = await open(converted, "wx");'), endText = '  report.status = "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance";', end = source.indexOf(endText, start);
  assert.ok(start > 0 && end > start);
  add(source.slice(start, end + endText.length),
    '  report.workerIsolation = false; report.explicitCpuWorker = true; report.originalStartup = {};\n' +
    '  observer.setPhase("conversion"); report.conversionStartedAt = new Date().toISOString();\n' +
    '  try { await runVp9OriginalStartup({ page, observer, blankBaseline: report.blankBaseline, evidence: report.originalStartup }); }\n' +
    '  finally { report.browserResult = report.originalStartup.result; report.memory = report.originalStartup.memory; report.conversionEndedAt = new Date().toISOString(); }\n' +
    '  assert.deepEqual(report.privateCpuOverride.served, { javascript: 1, wasm: 1 }); assert.equal(report.privateAssetErrorCount, 0);\n' +
    '  assert.deepEqual(report.forbiddenRequests, []);\n' +
    '  report.status = "passed-private-original-startup-only-not-completed-transcode";');
  let reversed = source;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(sha(reversed), parentSha256);
  return { generated: source, parentSha256, generatedSha256: sha(source), edits, reversible: true,
    protectedOriginalPassedWithoutCopyOrExcerpt: true, changesNativeCore: false, changesMemoryFormulaOrLimit: false,
    changesBaselineWindowOrThreshold: false, startupOnly: true, fullFileAcceptance: false, publicAcceptance: false };
}
