import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MPEG2 protected gate uses the original full fixture, fixed heap and required early full-tree native observer", async () => {
  const gate = await readFile(new URL("../scripts/mpeg2-protected-memory.mjs", import.meta.url), "utf8");
  assert.match(gate, /2958573265/);
  assert.match(gate, /31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34/);
  assert.match(gate, /manifest.maximumWasmMemoryBytes, 32 \* MiB/);
  assert.match(gate, /startParallelMemoryObserver\(chrome.pid, runtime.directory\)/);
  assert.ok(gate.indexOf("startParallelMemoryObserver(chrome.pid") < gate.indexOf('blankBaseline = await stable("blank-baseline")'));
  assert.ok(gate.indexOf('blankBaseline = await stable("blank-baseline")') < gate.indexOf('await page.goto(query)'));
  assert.match(gate, /observer\.through\(Date.now\(\)\)/);
  assert.match(gate, /Math.max\(run.cimPeakPrivateBytes \?\? -Infinity, run.nativePeaks.peak.privateBytes\)/);
  assert.match(gate, /run.incrementalPrivateMiB <= 250/);
  assert.match(gate, /DOM.setFileInputFiles/);
  assert.doesNotMatch(gate, /maxWidth:|setInputFiles\(|truncate\(source|writeFile\(source/);
  assert.match(gate, /video.width, 1920/); assert.match(gate, /video.height, 804/);
  assert.match(gate, /number <= 3/);
  assert.match(gate, /sourceHashes/);
});

test("MPEG2 large selected-handle staging handles both actual production ABIs without changing native options", async () => {
  const stage = await readFile(new URL("../scripts/stage-mpeg2-large-candidate.mjs", import.meta.url), "utf8");
  assert.match(stage, /mapped\[0\] === 1 && mapped.length === 9/);
  assert.match(stage, /\.\.\.mapped.slice\(4\)/);
  assert.match(stage, /within-direct.mjs/);
  assert.match(stage, /within-direct.wasm/);
  assert.match(stage, /Candidate artifact mismatch/);
  assert.match(stage, /Restoration hash mismatch/);
});

test("MPEG2 long diagnostics keep bounded histories, failures and independent cleanup actions", async () => {
  const gate = await readFile(new URL("../scripts/mpeg2-protected-memory.mjs", import.meta.url), "utf8");
  assert.match(gate, /samples.length === 1024/);
  assert.match(gate, /samplesEvicted\+\+/);
  assert.match(gate, /maxBuffer: 32 \* MiB/);
  assert.match(gate, /ssim >= 0.98/);
  assert.match(gate, /maximumTimestampErrorSeconds <= 0.001/);
  assert.match(gate, /cleanupErrors.push\(String\(error\)\)/);
  assert.match(gate, /finishOwnedCleanup\(\[\(\) => stopOwned\(chrome\), \(\) => stopOwned\(server\)\]\)/);
  assert.ok(gate.lastIndexOf('"restore", "byob"') < gate.lastIndexOf("await runtime.close()"));
  assert.match(gate, /protectedFixtureUnchanged = true/);
  assert.doesNotMatch(gate, /file\.arrayBuffer\(\)|Blob\(|MEMFS|fetchFile\(/);
});
