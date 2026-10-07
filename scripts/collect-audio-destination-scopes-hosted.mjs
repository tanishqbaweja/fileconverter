// Download ONLY synthetic small-browser JSON reports, never source/output media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const gh = "D:/Program Files/GitHub CLI/gh.exe", repo = "tanishqbaweja/fileconverter";
const runId = "37684741516", expectedCommit = "bb45f39bd6081cf5fe8598dec43a080fedd4ef3b";
const report = path.join(root, "evidence/audio-destination-scopes-hosted-2026-10-08.json");
await assert.rejects(access(report), { code: "ENOENT" });
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 8 * 1024 ** 2);
const runtime = await createOwnedRuntimeScratch("audio-scope-hosted-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const call = args => execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true,
  timeout: 30000, maxBuffer: 1024 * 1024 });
let run, artifact, reports;
try {
  run = JSON.parse((await call(["run", "view", runId, "--repo", repo, "--json",
    "databaseId,headSha,createdAt,updatedAt,status,conclusion,jobs"])).stdout);
  assert.equal(String(run.databaseId), runId); assert.equal(run.headSha, expectedCommit);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  const listing = JSON.parse((await call(["api", `repos/${repo}/actions/runs/${runId}/artifacts`])).stdout);
  assert.equal(listing.total_count, 1); assert.equal(listing.artifacts.length, 1);
  artifact = listing.artifacts[0];
  assert.equal(artifact.name, `audio-destination-scopes-${runId}`);
  assert.equal(artifact.expired, false);
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 2 * 1024 ** 2);
  const download = path.join(runtime.directory, "reports");
  await call(["run", "download", runId, "--repo", repo, "--name", artifact.name, "--dir", download]);
  const entries = await readdir(download); assert.equal(entries.length, 8);
  reports = [];
  for (const file of entries.toSorted()) {
    assert.match(file, /^audio-destination-scopes-[a-z0-9-]+-[0-9a-f-]{36}\.json$/);
    const target = path.join(download, file), info = await lstat(target);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size < 256 * 1024);
    const bytes = await readFile(target); assert.equal(bytes.length, info.size);
    reports.push({ file, bytes: bytes.length, sha256: sha(bytes), rawJson: bytes.toString("utf8") });
  }
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
}
const proof = { recordedAt: new Date().toISOString(), status: "collected-unverified-hosted-browser-scope-reports",
  run, artifact, reports, downloadRuntime: runtime.directory, ownedDownloadRemoved: true,
  protectedOriginalRead: false, localBrowserLaunched: false, localBuildPerformed: false,
  hostedArtifactDeleted: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false,
  collectorSourceSha256: sha(await readFile(new URL(import.meta.url))) };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 2 * 1024 ** 2);
await writeFile(report, json, { flag: "wx" });
console.log(JSON.stringify({ report, rawReports: reports.length, rawBytes: reports.reduce((n, row) => n + row.bytes, 0),
  artifactBytes: artifact.size_in_bytes, first: JSON.parse(reports[0].rawJson), ownedDownloadRemoved: true }));
