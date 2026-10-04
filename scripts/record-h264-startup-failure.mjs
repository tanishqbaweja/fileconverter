import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { summarizeH264StartupFailure } from "./lib/h264-startup-failure.mjs";

const root = path.resolve(import.meta.dirname, "..");
const relative = process.argv[2];
assert.match(relative ?? "", /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-startup-scaling-memory\.json$/);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.ok((await stat(path.join(root, relative))).size < 4 * 1024 ** 2);
const raw = await readFile(path.join(root, relative));
const report = JSON.parse(raw), summary = summarizeH264StartupFailure(report);
for (const [file, expected] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), expected, `Executed source: ${file}`);
const currentSources = Object.fromEntries(await Promise.all([
  "scripts/lib/h264-startup-failure.mjs", "scripts/record-h264-startup-failure.mjs",
  "scripts/lib/h264-stress-profile.mjs",
].map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
const exec = promisify(execFile);
const { stdout: ownedChrome } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "@(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*fileconverter*' }).Count"], { windowsHide: true });
assert.equal(Number(ownedChrome.trim()), 0, "No benchmark-owned Chrome remains");
const staticTools = [];
for (const directory of await readdir(path.join(root, "work"))) {
  if (directory === ".gitkeep") continue;
  assert.match(directory, /^h264-(candidate-output|speed-baseline-37157670815|dimension-baseline-37155139021|rejected-lto-37159386013|sad-candidate-output)$/);
  let bytes = 0;
  for (const file of await readdir(path.join(root, "work", directory))) {
    assert.match(file, /^(within-h264\.(mjs|wasm|mjs\.symbols)|build-manifest\.json|config_components\.h|LICENSE\.(ffmpeg|openh264))$/);
    const info = await stat(path.join(root, "work", directory, file)); assert.ok(info.isFile()); bytes += info.size;
  }
  staticTools.push({ path: `work/${directory}`, bytes });
}
const distHashes = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm"]) {
  const hash = sha(await readFile(path.join(root, "dist/client/engines/remux", file)));
  assert.equal(hash, sha(await readFile(path.join(root, "public/engines/remux", file)))); distHashes[file] = hash;
}
const tracePath = relative.replace(/\.json$/, "-trace.zip"), trace = await readFile(path.join(root, tracePath));
assert.ok(trace.length > 0 && trace.length < 1024 ** 2);
const mjs = await readFile(path.join(root, "work", report.candidateName, "within-h264.mjs"), "utf8");
assert.equal(sha(mjs), report.asBuiltManifest.artifacts["within-h264.mjs"]);
assert.ok(mjs.includes("var ptr=_malloc(12+Asyncify.StackSize)"));
assert.ok(mjs.includes("_free(Asyncify.currData);Asyncify.currData=null"));
const generated = path.join(root, "evidence/h264-startup-scaling-failure-2026-10-04.json");
await writeFile(generated, `${JSON.stringify({ recordedAt: new Date().toISOString(), requirement: "M-04",
  status: summary.status, summary, report: { path: relative, sha256: sha(raw), data: report },
  failureTrace: { path: tracePath, bytes: trace.length, sha256: sha(trace) }, currentSources,
  investigation: {
    actualGeneratedAsyncifyAllocatesAndFreesEachSuspendStack: true,
    configuredAsyncifyStackBytes: 1048576,
    mp4GlobalFragmentIndexHypothesisNotSupportedByCurrentFlags: {
      source: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/movenc.c",
      function: "mov_write_moof_tag", explanation: "skip_trailer, no global_sidx and no ism_lookahead bypass mov_add_tfra_entries; this is a source check, not a complete allocation trace",
    },
    nextAction: "Measure native allocator live/free/largest-free-block usage over time before changing allocations; rerun the unchanged 600s gate only after a diagnostic or bounded-allocation implementation change",
    prohibitedWorkarounds: ["Heap growth or higher fixed limit as compliance", "Smaller substitute fixture", "Delayed/larger blank baseline", "Omitted utility processes", "Partial output treated as a conversion"],
  },
  cleanup: { staticTools, retainedStaticToolBytes: staticTools.reduce((n, s) => n + s.bytes, 0),
    convertedMediaBytesInWork: 0, ownedBenchmarkChromeProcesses: 0, distHashes },
  publicAcceptance: false,
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${generated}\n${JSON.stringify(summary, null, 2)}\n`);
