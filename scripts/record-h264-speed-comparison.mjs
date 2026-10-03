import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { compareH264Speed } from "./lib/h264-speed-comparison.mjs";

const root = path.resolve(import.meta.dirname, "..");
const exec = promisify(execFile);
const reports = [];
for (const relative of process.argv.slice(2)) {
  assert.match(relative, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-720p-memory\.json$/);
  const file = path.join(root, relative);
  assert.ok((await stat(file)).size < 4 * 1024 ** 2, "Compact report size cap");
  const bytes = await readFile(file);
  reports.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), report: JSON.parse(bytes) });
}
assert.equal(reports.length, 2, "Usage: node scripts/record-h264-speed-comparison.mjs baseline.json candidate.json");
const comparison = compareH264Speed(reports[0].report, reports[1].report);
const gh = "D:\\Program Files\\GitHub CLI\\gh.exe";
const { stdout } = await exec(gh, ["run", "view", "37159386013", "--json", "status,conclusion,headSha,jobs,url"], { cwd: root, windowsHide: true });
const build = JSON.parse(stdout);
assert.equal(build.status, "completed"); assert.equal(build.conclusion, "success");
assert.equal(build.headSha, "8256056e8c28ba5951ec45eb40ebc0ab2460d10f");
const steps = build.jobs[0].steps;
assert.equal(steps.find((step) => step.name === "Remove repository-local build data").conclusion, "success");
const { stdout: artifactJson } = await exec(gh, ["api", "repos/tanishqbaweja/fileconverter/actions/runs/37159386013/artifacts"], { cwd: root, windowsHide: true });
assert.equal(JSON.parse(artifactJson).total_count, 0, "Delete hosted temporary artifacts after verified local staging");
const { stdout: buildLog } = await exec(gh, ["run", "view", "37159386013", "--log"],
  { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 });
const openh264LtoCompileCommands = buildLog.split(/\r?\n/).filter((line) => /em\+\+.*-flto.* -c -o codec\//.test(line)).length;
const ffmpegConfigureUsesLto = /--extra-cflags=[^\r\n]*-flto/.test(buildLog);
assert.ok(openh264LtoCompileCommands > 10, "Hosted log must show real OpenH264 LTO object compilation");
assert.ok(ffmpegConfigureUsesLto, "Hosted FFmpeg configure must receive LTO compile flags");
const sources = ["scripts/lib/h264-speed-comparison.mjs", "scripts/lib/h264-candidate-selection.mjs", "scripts/record-h264-speed-comparison.mjs"];
const currentSources = Object.fromEntries(await Promise.all(sources.map(async (file) => [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
const evidence = {
  recordedAt: new Date().toISOString(), requirement: "M-04",
  status: comparison.privateOptimizationCandidatePassed ? "private-720p-library-lto-candidate-pass-not-public" : "library-lto-not-accepted",
  build: { ...build, remainingRemoteArtifacts: 0, sourceBundleDownloaded: false,
    logSha256: createHash("sha256").update(buildLog).digest("hex"), openh264LtoCompileCommands, ffmpegConfigureUsesLto },
  comparison, reports, currentSources, publicAcceptance: false,
  remaining: ["Clean-session repeats and browser-startup overlap", "Direct-destination success and fault recovery", "Multi-gigabyte scaling", "Complex stream/color/VFR/controls fidelity", "Reproducibility and legal deployment review", "Registry/UI/release integration", "All remaining original requirements"],
};
const output = path.join(root, "evidence/h264-library-lto-comparison-2026-10-04.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n${JSON.stringify(comparison, null, 2)}\n`);
