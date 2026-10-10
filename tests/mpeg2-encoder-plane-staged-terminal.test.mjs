// Analyzer identity/logic tests only; no new conversion or full-session proof.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeStagedFullTerminalAnalyzer, stagedTerminalAnalysisFiles } from "../scripts/lib/encoder-plane-staged-terminal-recipe.mjs";
import { makeEncoderPlaneStagedFullDriver, makeEncoderPlaneStagedFullCaller } from "../scripts/lib/encoder-plane-staged-full-recipe.mjs";
import { encoderPlaneTerminalFacts } from "../scripts/lib/encoder-plane-terminal-facts.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const source = (await read("scripts/analyze-encoder-plane-full-terminal.mjs")).toString();
test("New post-terminal analyzer reverses byte-exactly to actually executed audit with same gates and extra own source pins", () => {
  const recipe = makeStagedFullTerminalAnalyzer(source, root);
  const reversed = recipe.edits.toReversed().reduce((s, [before, after]) => s.replace(after, before), recipe.generated);
  assert.equal(reversed, source);
  const check = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(check.status, 0, check.stderr);
  for (const token of ['encoderPlaneTerminalFacts(raw)', 'assert.equal(raw.status, receipt.candidate.actualExitCode',
    'assert.deepEqual(receipt.sourcePins, receipt.postSourcePins)', 'Math.abs(Date.parse(now.createdAt)',
    'hash.digest("hex")', 'windowsHide: true', 'flag: "wx"', 'publicAcceptance: false',
    'assert.equal(executed.generated, expected.generated)', 'assert.equal(executed.generatedCaller, caller.generated)',
    ...stagedTerminalAnalysisFiles]) assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeStagedFullTerminalAnalyzer(source + "\n", root));
  assert.equal(recipe.additionalCleanSessionRequired, true);
});
test("Actual live227-source archive reconstructs changed observer driver/caller, while verifier additions are not measured-source edits", async () => {
  const live = JSON.parse(await read("evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-full-live.json"));
  const archive = await read(live.sourceArchive.path); assert.equal(sha(archive), live.sourceArchive.sha256);
  const bytes = gunzipSync(archive, { maxOutputLength: 8388608 }); assert.equal(sha(bytes), live.sourceArchive.restoredSha256);
  const executed = JSON.parse(bytes);
  const prior = JSON.parse(await read(live.previousTerminal.path));
  const previous = JSON.parse(gunzipSync(await read(prior.sourceArchive.path), { maxOutputLength: 8388608 }));
  const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
  assert.equal(makeEncoderPlaneStagedFullDriver(previous, root, live.wrapper, branch).generated, executed.generated);
  assert.equal(makeEncoderPlaneStagedFullCaller((await read("scripts/run-single-idle-original-full.mjs")).toString(), root).generated,
    executed.generatedCaller);
  assert.equal(Object.keys(executed.sourcePreimages).length, 227);
  for (const file of stagedTerminalAnalysisFiles) assert.equal(Object.hasOwn(live.sourcePins, file), false, file);
});
test("Post-terminal command refuses actual live path before source/archive/process/fixture inspection or scratch allocation", async () => {
  const livePath = "evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-full-live.json";
  const liveBytes = await read(livePath), live = JSON.parse(liveBytes);
  const result = spawnSync(process.execPath, ["scripts/analyze-encoder-plane-staged-full-terminal.mjs", livePath],
    { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /AssertionError/);
  assert.equal(result.stdout, ""); assert.deepEqual(await read(livePath), liveBytes);
  assert.ok(!result.stderr.includes("CimInstance") && !result.stderr.includes("test.mkv"));
  // Do not require live media/profile to be absent, or touch them for a unit test.
  assert.equal(live.executions, 1);
  const cli = (await read("scripts/analyze-encoder-plane-staged-full-terminal.mjs")).toString();
  assert.ok(cli.indexOf('assert.match(receiptPath') < cli.indexOf('const recipe ='));
  assert.ok(cli.indexOf('receipt.driverAbsent.status') < cli.indexOf('const runtime ='));
  assert.doesNotMatch(cli, /spawn\(|execFile\(|kill\(|unlink\(|rm\(/);
});
test("Actual previous below-budget final-copy failure remains zero completed runs and no public/session/scaling/speed pass", async () => {
  const receipt = JSON.parse(await read("evidence/2026-10-10T13-32-15-738Z-encoder-plane-original-full-terminal.json"));
  const raw = JSON.parse(gunzipSync(await read(receipt.candidate.compressedReport.path), { maxOutputLength: 33554432 }));
  const facts = encoderPlaneTerminalFacts(raw);
  assert.equal(facts.native.observedIncrementalPrivateMiB, 234.96875);
  assert.equal(facts.completedConversions, 0); assert.equal(facts.fullOriginalSessionGatePassed, false);
  for (const field of ["publicAcceptance", "scalingAcceptance", "conversionSpeedAcceptance", "goalComplete"])
    assert.equal(facts[field], false, field);
  // Explicitly no new driver, converter, build or native FFmpeg invocation.
  assert.equal(raw.failure.message, "Reject reset/nonmonotonic work counters");
});
