import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const H264_SPEED_BASELINE_COMMIT = "a1648ddfe48c0273d45e5cb4e395e7e837b79913";
export const H264_SPEED_BASELINE_RECIPE_SHA256 = "94ff4a1df7b80095f02182d10674efab43b0e13bef4d1077f230ecdcefa6e5eb";
export function candidateDirectory(root, name = "h264-candidate-output") {
  assert.ok(["h264-candidate-output", "h264-speed-baseline-37157670815", "h264-sad-candidate-output"].includes(name), "Unknown private H264 tool directory");
  return path.join(root, "work", name);
}
export async function verifyCandidateRecipe(root, expected, current) {
  if (expected === current) return { kind: "current", sha256: current };
  assert.equal(expected, H264_SPEED_BASELINE_RECIPE_SHA256, "Unrecognized historical H264 recipe");
  const { stdout } = await exec("git", ["show", `${H264_SPEED_BASELINE_COMMIT}:media/ffmpeg/build-h264-candidate.sh`],
    { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 64 * 1024 });
  const hash = createHash("sha256").update(stdout).digest("hex");
  assert.equal(hash, expected, "Historical build recipe must match its exact Git source, not just a label");
  return { kind: "historical", commit: H264_SPEED_BASELINE_COMMIT, sha256: hash };
}
