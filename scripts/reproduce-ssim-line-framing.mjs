// Independent-validator diagnostic only: two generated lavfi inputs, null sink.
// No user media is converted, and no output file is produced.
import "./lib/reliable-readonly-preflight.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { inspectSsimSummary as corrected } from "./lib/cr-aware-ssim-summary.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectSsimSummary } from "./lib/bounded-ssim-summary.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const runtime = await createOwnedRuntimeScratch("ssim-framing-probe-");
try {
  const args = ["-v", "info", "-re", "-f", "lavfi", "-i", "testsrc2=size=128x96:rate=24:duration=2",
    "-f", "lavfi", "-i", "testsrc2=size=128x96:rate=24:duration=2", "-filter_complex",
    "[0:v:0]settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim", "-an", "-f", "null", "-"];
  const cases = [];
  for (const lowQuality of [false, true]) {
    const actualArgs = [...args];
    if (lowQuality) actualArgs[actualArgs.indexOf("-filter_complex") + 1] = actualArgs[actualArgs.indexOf("-filter_complex") + 1].replace("setpts=N[out]", "setpts=N,eq=brightness=0.1[out]");
    const { stderr } = await promisify(execFile)("C:/ffmpeg/bin/ffmpeg.exe", actualArgs,
      { windowsHide: true, env: runtime.env, timeout: 30000, maxBuffer: 1048576 });
    const before = inspectSsimSummary(stderr), after = corrected(stderr);
    assert.equal(before.status, "missing-summary"); assert.equal(after.status, "numeric-summary");
    assert.equal(after.stderrSha256, before.stderrSha256); assert.equal(after.stderrBytes, before.stderrBytes);
    assert.equal(after.score >= 0.98, !lowQuality);
    cases.push({ lowQuality, args: actualArgs, oldParser: before, correctedParser: after, stderr,
      carriageReturns: [...stderr.matchAll(/\r/g)].length });
  }
  const ownSources = {};
  for (const file of ["scripts/reproduce-ssim-line-framing.mjs", "scripts/lib/cr-aware-ssim-summary.mjs", "tests/cr-aware-ssim-summary.test.mjs"]) {
    const bytes = await readFile(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
  }
  const binaryHash = createHash("sha256"); for await (const chunk of createReadStream("C:/ffmpeg/bin/ffmpeg.exe", { highWaterMark: 1048576 })) binaryHash.update(chunk);
  const file = "evidence/2026-10-19-ssim-cr-framing-native-v2.json";
  await writeFile(file, JSON.stringify({ recordedAt: new Date().toISOString(), cases, ownSources,
    executable: { path: "C:/ffmpeg/bin/ffmpeg.exe", sha256: binaryHash.digest("hex") },
    noOutputFile: true, noUserMediaRead: true, acceptance: false }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, cases: cases.map(row => ({ lowQuality: row.lowQuality, old: row.oldParser.status, corrected: row.correctedParser.status, score: row.correctedParser.score })) }));
} finally { await runtime.close(); }
