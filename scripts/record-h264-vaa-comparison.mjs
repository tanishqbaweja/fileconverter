import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { compareH264VaaSpeed } from "./lib/h264-vaa-speed-comparison.mjs";

const root = path.resolve(import.meta.dirname, "..");
const exec = promisify(execFile), gh = "D:\\Program Files\\GitHub CLI\\gh.exe";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const reports = [];
for (const relative of process.argv.slice(2)) {
  assert.match(relative, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-720p-memory\.json$/);
  assert.ok((await stat(path.join(root, relative))).size < 4 * 1024 ** 2);
  const raw = await readFile(path.join(root, relative));
  reports.push({ path: relative, sha256: sha(raw), report: JSON.parse(raw) });
}
assert.equal(reports.length, 2, "Usage: baseline report then SIMD report");
const arithmetic = JSON.parse(await readFile(path.join(root, "evidence/openh264-vaa-arithmetic-2026-10-04.json")));
const comparison = compareH264VaaSpeed(reports[0].report, reports[1].report, arithmetic);
const runCommand = (args) => exec(gh, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 });
const { stdout: runText } = await runCommand(["run", "view", "37189794149", "--repo", "tanishqbaweja/fileconverter", "--json", "status,conclusion,headSha,jobs,url"]);
const build = JSON.parse(runText);
assert.equal(build.status, "completed"); assert.equal(build.conclusion, "success");
assert.equal(build.headSha, "3a8395edd54eef9411b9f5b77b45c07c74616959");
assert.equal(build.jobs[0].steps.find((step) => step.name === "Remove repository-local build data").conclusion, "success");
const { stdout: log } = await runCommand(["run", "view", "37189794149", "--repo", "tanishqbaweja/fileconverter", "--log"]);
assert.ok(log.includes("Applied proven exact-result private VAA SIMD delegate; all codec settings unchanged."));
assert.ok(log.includes("WITHIN_H264_VAA_SIMD=\"1\""));
const { stdout: artifacts } = await runCommand(["api", "repos/tanishqbaweja/fileconverter/actions/runs/37189794149/artifacts"]);
assert.equal(JSON.parse(artifacts).total_count, 0, "Downloaded static module verified and temporary hosted artifacts removed before compaction");
const manifest = reports[1].report.asBuiltManifest;
for (const [file, field] of [["scripts/apply-vaa-simd.mjs", "applierSha256"], ["scripts/lib/openh264-vaa-patch.mjs", "patchLogicSha256"]]) {
  const { stdout } = await exec("git", ["show", `${build.headSha}:${file}`], { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 1024 ** 2 });
  assert.equal(sha(stdout), manifest.openh264VaaSimdProvenance[field]);
}
for (const [file, expected] of [["evidence/openh264-vaa-arithmetic-2026-10-04.json", manifest.openh264VaaSimdProvenance.proofEvidenceSha256],
  ["media/ffmpeg/openh264-vaa-simd.h", manifest.openh264VaaSimdProvenance.helperSha256],
  ["media/ffmpeg/build-h264-candidate.sh", manifest.buildRecipeSha256]]) {
  const { stdout } = await exec("git", ["show", `${build.headSha}:${file}`], { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 1024 ** 2 });
  assert.equal(sha(stdout), expected, `As-built provenance: ${file}`);
}
const sources = ["scripts/lib/h264-vaa-speed-comparison.mjs", "scripts/record-h264-vaa-comparison.mjs",
  "scripts/apply-vaa-simd.mjs", "scripts/lib/openh264-vaa-patch.mjs", "media/ffmpeg/build-h264-candidate.sh", "media/ffmpeg/h264-candidate-manifest.mjs"];
const currentSources = Object.fromEntries(await Promise.all(sources.map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
const workEntries = await readdir(path.join(root, "work"));
assert.ok(workEntries.every((name) => name === ".gitkeep" || /^h264-(candidate-output|speed-baseline-37157670815|dimension-baseline-37155139021|rejected-lto-37159386013|rejected-vaa-37189794149)$/.test(name)), "No uncleaned media/profile/build/download work directory");
const staticTools = [];
for (const directory of workEntries.filter((name) => name !== ".gitkeep")) {
  const files = await readdir(path.join(root, "work", directory));
  let bytes = 0;
  for (const name of files) {
    assert.ok(/^(within-h264\.(mjs|wasm|mjs\.symbols)|build-manifest\.json|config_components\.h|LICENSE\.(ffmpeg|openh264))$/.test(name), "Only static reusable tools may remain");
    const info = await stat(path.join(root, "work", directory, name)); assert.ok(info.isFile()); bytes += info.size;
  }
  staticTools.push({ path: `work/${directory}`, bytes });
}
const distHashes = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm"]) {
  const hash = sha(await readFile(path.join(root, "dist/client/engines/remux", file)));
  assert.equal(hash, sha(await readFile(path.join(root, "public/engines/remux", file)))); distHashes[file] = hash;
}
const output = path.join(root, "evidence/h264-vaa-simd-comparison-2026-10-04.json");
await writeFile(output, `${JSON.stringify({ recordedAt: new Date().toISOString(), requirement: "M-04",
  status: comparison.privateOptimizationCandidatePassed ? "private-720p-vaa-simd-speed-pass-not-public" : "vaa-simd-not-accepted",
  build: { ...build, logSha256: sha(log), sourceBundleDownloaded: false, remainingRemoteArtifacts: 0 },
  comparison, reports, currentSources, publicAcceptance: false,
  cleanup: { staticTools, retainedStaticToolBytes: staticTools.reduce((sum, tool) => sum + tool.bytes, 0),
    convertedMediaBytesInWork: 0, distHashes, hostedArtifactsRemaining: 0 },
  remaining: ["Clean-session and startup-overlap memory repeats", "Direct output, cancellation and write-failure recovery",
    "Multi-gigabyte scaling", "Complex streams/color/VFR/controls", "Exact reproducibility and legal deployment review",
    "Registry/UI release integration", "All remaining original requirements"],
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n${JSON.stringify(comparison, null, 2)}\n`);
