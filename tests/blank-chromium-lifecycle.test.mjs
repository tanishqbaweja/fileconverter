import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("Blank lifecycle probe cannot load converter/input, change launch flags, discard processes or certify conversion", async () => {
  const source = await readFile(new URL("../scripts/diagnose-blank-chromium-lifecycle.mjs", import.meta.url), "utf8");
  for (const needle of ['assert.deepEqual(quotedArguments, fixedArguments)', 'durationMs = 300000',
    'sampleChromiumTree(chrome.pid)', 'privateBytes: null', 'earlyStable ??= stableWindow(samples)',
    'assert.equal(page.url(), "about:blank"', 'baselineAdjusted: false', 'publicAcceptance: false',
    'converterLoaded: false', 'conversionsPerformed: 0', 'await observer.stop()', 'runtime.close()',
    'samples.length < 256']) assert.ok(source.includes(needle), needle);
  assert.doesNotMatch(source, /setInputFiles|FileInput|ffmpeg|\/\?test=|disable.*OnDeviceModel/);
});
