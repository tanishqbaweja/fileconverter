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

test("MPEG2 protected acceptance cannot hide artwork, color, metadata or compatible-track loss", async () => {
  const gate = await readFile(new URL("../scripts/mpeg2-protected-memory.mjs", import.meta.url), "utf8");
  for (const field of ["sample_aspect_ratio", "display_aspect_ratio", "color_range",
    "color_space", "color_transfer", "color_primaries", "chroma_location", "r_frame_rate"])
    assert.ok(gate.includes(`"${field}"`), field);
  assert.match(gate, /Preserve primary video disposition/);
  assert.match(gate, /Preserve container metadata/);
  assert.match(gate, /outputAudio.length, inputAudio.length/);
  assert.match(gate, /after.chapters, sourceProbe.chapters/);
  assert.match(gate, /outputArt.length, inputArt.length/);
  assert.match(gate, /compressedHash\(output, outputArt\[i\].index\), originalHash/);
  assert.match(gate, /"-map", "0:v", "-map", "0:a"/);
  const browser = await readFile(new URL("./browser/mpeg2-artwork-candidate.spec.ts", import.meta.url), "utf8");
  assert.match(browser, /compressedArtworkHash\(output, outputArt!\.index\)\).toBe\(originalArtworkHash\)/);
  assert.match(browser, /No undeclared empty\/unknown tracks/);
  assert.match(browser, /outputArt\?\.width\).toBe\(250\)/);
  assert.match(browser, /outputArt\?\.height\).toBe\(140\)/);
  assert.match(browser, /Within FFmpeg MPEG-2/);
  assert.match(browser, /toBeGreaterThanOrEqual\(0.98\)/);
});

test("MPEG2 bounded deeper-stack diagnosis cannot become acceptance or change native memory settings", async () => {
  const gate = await readFile(new URL("../scripts/mpeg2-protected-memory.mjs", import.meta.url), "utf8");
  const stage = await readFile(new URL("../scripts/stage-mpeg2-large-candidate.mjs", import.meta.url), "utf8");
  assert.match(gate, /if \(diagnosticOnly && number > 1\) break/);
  assert.match(gate, /assert.equal\(diagnosticOnly, false, "Private allocation\/stack diagnostic cannot certify protected acceptance"\)/);
  assert.match(gate, /stackDiagnostic \|\| manifest.allocatorDiagnostic === true/);
  assert.match(gate, /allocatorSamples.length === 96/);
  assert.match(stage, /Error.stackTraceLimit = 48/);
  assert.match(stage, /String\(error.stack\).slice\(0, 8192\)/);
  assert.match(stage, /offset \+= 1600/);
  assert.match(stage, /\["0", "1"\].includes\(stackMode\)/);
  assert.doesNotMatch(stage, /INITIAL_MEMORY|ALLOW_MEMORY_GROWTH|MAXIMUM_MEMORY/);
});
