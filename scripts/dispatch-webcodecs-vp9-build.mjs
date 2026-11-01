// Dispatch the exact isolated branch once; no `all` selector and no workflow on main changed.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), repo = "tanishqbaweja/fileconverter", execute = promisify(execFile);
const output = path.join(root, "evidence/2026-11-01-webcodecs-vp9-build-dispatch.json");
await assert.rejects(access(output), { code: "ENOENT" });
const branch = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-build-branch.json")));
assert.equal(branch.branch, "codex/webcodecs-vp9-source-20261101");
assert.match(branch.commit, /^[a-f0-9]{40}$/);
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-dispatch-");
let report;
try {
  const gh = async args => (await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", args,
    { cwd: root, env: { ...runtime.env, GH_PROMPT_DISABLED: "true" }, windowsHide: true, timeout: 60000, maxBuffer: 262144 })).stdout;
  const remote = JSON.parse(await gh(["api", `repos/${repo}/git/ref/heads/${branch.branch}`])); assert.equal(remote.object.sha, branch.commit);
  const list = async () => JSON.parse(await gh(["run", "list", "--repo", repo, "--branch", branch.branch, "--limit", "10", "--json",
    "databaseId,headSha,status,conclusion,event,createdAt,url,workflowName"]));
  const before = new Set((await list()).map(x => x.databaseId)), dispatchedAt = new Date().toISOString();
  await gh(["api", "--method", "POST", `repos/${repo}/actions/workflows/reproduce-ffmpeg-nondocker.yml/dispatches`, "-f", `ref=${branch.branch}`]);
  // One deliberate propagation delay, never repeated conversion/build polling.
  await new Promise(resolve => setTimeout(resolve, 10000));
  const matches = (await list()).filter(x => !before.has(x.databaseId) && x.headSha === branch.commit && x.event === "workflow_dispatch");
  assert.equal(matches.length, 1, "Ambiguous/absent dispatch: inspect before taking any further action");
  assert.equal(matches[0].workflowName, "Build private WebCodecs VP9 encoder without Docker");
  report = { recordedAt: new Date().toISOString(), dispatchedAt, branch: branch.branch, head: branch.commit, run: matches[0],
    expectedWaitMinutes: [6, 10], onlyPrivateEncoderBuildSelected: true, noDocker: true,
    browserConversionsPerformed: 0, buildAcceptance: false, speedGainProven: false, publicAcceptance: false };
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
report.ownedDispatchRuntimeRemoved = true;
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify(report));
