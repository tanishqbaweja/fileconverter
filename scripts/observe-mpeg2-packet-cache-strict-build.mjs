// One authoritative hosted-job observation; no polling loop or user-file reads.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const repository = "tanishqbaweja/fileconverter", workflow = "reproduce-ffmpeg-nondocker.yml";
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json")));
assert.equal(branch.remoteVerified, true); assert.equal(branch.branch, "codex/mpeg2-packet-cache-20261012-warning-fix");
assert.equal(process.argv.length, 3);
const mode = process.argv[2], gh = process.platform === "win32" ? "D:/Program Files/GitHub CLI/gh.exe" : "gh";
const run = async args => (await execute(gh, args, { cwd: root, env: process.env, windowsHide: true, timeout: 60000, maxBuffer: 262144 })).stdout.trim();
if (mode === "--dispatch") {
  const output = path.join(root, "evidence/packet-cache-strict-build-dispatch-2026-10-12.json");
  const receipt = { recordedAt: new Date().toISOString(), branch: branch.branch, headSha: branch.commit,
    repository, workflow, core: "within-mpeg2-aligned-reuse", dispatchAttempted: true,
    responseVerified: false, runId: null, userMediaUploaded: false };
  // Exclusive intent survives ambiguous network failures: never dispatch again blindly.
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  try {
    receipt.response = await run(["workflow", "run", workflow, "--repo", repository, "--ref", branch.branch, "-f", "core=within-mpeg2-aligned-reuse"]);
    receipt.responseVerified = true;
  } catch (error) { receipt.error = error.message; throw error; }
  finally { await writeFile(output, JSON.stringify(receipt, null, 2) + "\n"); }
  console.log(JSON.stringify(receipt));
} else {
  assert.ok(mode === "--locate" || /^\d+$/.test(mode));
  const raw = mode === "--locate"
    ? await run(["run", "list", "--repo", repository, "--workflow", workflow, "--branch", branch.branch, "--event", "workflow_dispatch", "--limit", "5", "--json", "databaseId,headSha,status,conclusion,createdAt,url"])
    : await run(["run", "view", mode, "--repo", repository, "--json", "databaseId,headSha,status,conclusion,createdAt,url,jobs"]);
  const parsed = JSON.parse(raw), state = mode === "--locate" ? parsed.find(item => item.headSha === branch.commit) : parsed;
  assert.ok(state, "Dispatch observation not yet available; re-observe, never redispatch");
  assert.equal(state.headSha, branch.commit); if (mode !== "--locate") assert.equal(String(state.databaseId), mode);
  const output = `evidence/packet-cache-strict-build-observation-${state.databaseId}-${Date.now()}.json`;
  await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), repository, expectedHead: branch.commit, state }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, ...state }));
}
