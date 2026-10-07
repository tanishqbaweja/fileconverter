import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { makeFlexOriginalDriver } from "../scripts/lib/mpeg2-flex-original-recipe.mjs";
test("changed full-source flex original retains all3repeats, six-hour deadline, original quality, exact memory and finally gates", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
  const generated = makeFlexOriginalDriver(source, root, s => import.meta.resolve(s));
  for (const text of ['const diagnosticOnly = false;', 'number <= 3', '6 * 60 * 60_000', 'minimumMs: 300000',
    'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes', 'run.incrementalPrivateMiB <= 250',
    'assert.ok(ssim >= 0.98)', 'assert.equal(video.width, 1920)', 'assert.equal(video.height, 804)',
    '32 * MiB', '16 * MiB', '64', 'maximumTimestampErrorSeconds <= 0.001',
    'await verifySource(); cleanup.protectedFixtureUnchanged = true;', 'observer.finishCapture()',
    'createBoundedDomCounterSampler', 'cssCandidate.staticAssets.length, 1']) assert.ok(generated.includes(text), text);
  assert.ok(generated.indexOf('await observer.finishCapture()') < generated.indexOf('await observer.stop()'));
  assert.ok(generated.includes('await domSession.detach()'));
  assert.ok(!/Tracing.requestMemoryDump|Memory.startSampling|collectGarbage|content-visibility/.test(generated));
  assert.ok(generated.includes('native-budget-failure'));
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => makeFlexOriginalDriver(source + "\n", root, s => import.meta.resolve(s)));
});
