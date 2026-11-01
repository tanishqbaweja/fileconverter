// Dispatch the exact isolated branch once; no `all` selector and no workflow on main changed.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.ok(process.argv.length === 2 || process.argv.length === 3);
const attempt = process.argv[2] ?? "1"; assert.match(attempt, /^[1-9]$/);
const suffix = attempt === "1" ? "" : "-attempt" + attempt;
const root = path.resolve(import.meta.dirname, ".."), repo = "tanishqbaweja/fileconverter", execute = promisify(execFile);
const output = path.join(root, "evidence/2026-11-01-webcodecs-vp9-build-dispatch" + suffix + ".json");
await assert.rejects(access(output), { code: "ENOENT" });
const branch = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-build-branch" + suffix + ".json")));
assert.equal(branch.branch, "codex/webcodecs-vp9-source-20261101" + suffix);
assert.match(branch.commit, /^[a-f0-9]{40}$/);
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-dispatch-");
const report = { recordedAt: new Date().toISOString(), branch: branch.branch, head: branch.commit,
  status: "dispatch-intent-recorded", dispatchMayHaveOccurred: false, run: null, buildAcceptance: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
try {
  const gh = async args => (await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", args,
    { cwd: root, env: { ...runtime.env, GH_PROMPT_DISABLED: "true" }, windowsHide: true, timeout: 60000, maxBuffer: 262144 })).stdout;
  const remote = JSON.parse(await gh(["api", `repos/${repo}/git/ref/heads/${branch.branch}`])); assert.equal(remote.object.sha, branch.commit);
  const list = async () => JSON.parse(await gh(["run", "list", "--repo", repo, "--branch", branch.branch, "--limit", "10", "--json",
    "databaseId,headSha,status,conclusion,event,createdAt,url,workflowName"]));
  const before = new Set((await list()).map(x => x.databaseId)), dispatchedAt = new Date().toISOString();
  report.dispatchedAt = dispatchedAt; report.dispatchMayHaveOccurred = true; report.status = "dispatch-in-flight";
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  await gh(["api", "--method", "POST", `repos/${repo}/actions/workflows/reproduce-ffmpeg-nondocker.yml/dispatches`, "-f", `ref=${branch.branch}`]);
  // One deliberate propagation delay, never repeated conversion/build polling.
  await new Promise(resolve => setTimeout(resolve, 10000));
  const matches = (await list()).filter(x => !before.has(x.databaseId) && x.headSha === branch.commit && x.event === "workflow_dispatch");
  assert.equal(matches.length, 1, "Ambiguous/absent dispatch: inspect before taking any further action");
  // The display name can come from the default branch, NOT the selected ref.
  Object.assign(report, { recordedAt: new Date().toISOString(), dispatchedAt, branch: branch.branch, head: branch.commit, run: matches[0],
    status: "dispatched-requires-exact-head-job-step-inspection", workflowDisplayNameNotSelectionProof: true,
    expectedWaitMinutes: [6, 10], onlyPrivateEncoderBuildSelected: true, noDocker: true,
    browserConversionsPerformed: 0, buildAcceptance: false, speedGainProven: false, publicAcceptance: false });
} catch (error) { report.status = "dispatch-inspection-required-do-not-redispatch"; report.error = String(error); process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.ownedDispatchRuntimeRemoved = true;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
}
