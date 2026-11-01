// Collect static reusable private tools only; bounded authenticated ZIP, no media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
assert.equal(process.argv.length, 3); const attempt = process.argv[2]; assert.match(attempt, /^[1-9]$/);
const suffix = attempt === "1" ? "" : "-attempt" + attempt;
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), repo = "tanishqbaweja/fileconverter";
const dispatch = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-build-dispatch" + suffix + ".json")));
const runId = dispatch.run.databaseId; assert.ok(Number.isSafeInteger(runId));
const terminal = JSON.parse(await readFile(path.join(root, `evidence/2026-11-01-webcodecs-vp9-build-${runId}-terminal.json`)));
assert.equal(terminal.head, dispatch.head); assert.equal(terminal.conclusion, "success");
const target = path.join(root, `work/webcodecs-vp9-input-${runId}`), output = path.join(root, `evidence/2026-11-01-webcodecs-vp9-native-${runId}.json`);
await assert.rejects(access(target), { code: "ENOENT" }); await assert.rejects(access(output), { code: "ENOENT" });
assert.equal(await realpath(path.join(root, "work")), path.join(root, "work"));
const sha = value => createHash("sha256").update(value).digest("hex");
const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-collection-");
let retained = false, identity;
try {
  const gh = async (args, maxBuffer = 1048576) => (await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer, encoding: "buffer" })).stdout;
  const artifact = JSON.parse(await gh(["api", `repos/${repo}/actions/artifacts/${terminal.artifact.id}`]));
  assert.equal(artifact.workflow_run.head_sha, dispatch.head); assert.equal(artifact.workflow_run.id, runId);
  assert.equal(artifact.name, `private-webcodecs-vp9-${runId}`); assert.equal(artifact.expired, false);
  assert.ok(artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 16777216);
  const zip = await gh(["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`], 16777216);
  assert.equal(artifact.digest, "sha256:" + sha(zip));
  const allowed = ["within-webcodecs-vp9.mjs", "within-webcodecs-vp9.wasm", "config_components.h", "config.mak", "LICENSE.LGPLv2.1",
    "within_remux.c", "within_webcodecs_vp9.c", "mpeg2-split-frame-layout.h", "build-webcodecs-vp9.sh", "register-webcodecs-vp9.mjs",
    "webcodecs-vp9-bridge.mjs", "registration.json", "native-contract.json"];
  const seen = new Set(); let total = 0;
  const members = unzipSync(zip, { filter(entry) {
    assert.ok(allowed.includes(entry.name) && !seen.has(entry.name)); seen.add(entry.name);
    assert.ok(entry.originalSize > 0 && entry.originalSize < (entry.name.endsWith(".wasm") ? 8388608 : 1048576));
    total += entry.originalSize; assert.ok(total <= 16777216); return true;
  } });
  assert.deepEqual(Object.keys(members).sort(), allowed.toSorted());
  const contract = JSON.parse(Buffer.from(members["native-contract.json"]).toString());
  assert.equal(contract.scope, "private-compiled-native-tool-static-contract-only");
  assert.equal(contract.publicAcceptance, false); assert.equal(contract.browserConversionVerified, false);
  assert.equal(contract.fallbackIntegrated, false); assert.equal(contract.speedGainProven, false);
  for (const [file, expected] of Object.entries(contract.artifacts)) {
    assert.equal(members[file].length, expected.bytes); assert.equal(sha(members[file]), expected.sha256);
  }
  for (const [file, expected] of Object.entries(contract.sources)) {
    assert.match(file, /^(?:media\/ffmpeg|workers|scripts|\.github\/workflows)\/[a-z0-9/_.-]+$/i);
    const bytes = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["show", dispatch.head + ":" + file],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576, encoding: "buffer" })).stdout;
    assert.equal(sha(bytes), expected, file);
  }
  assert.deepEqual(readWasmMemoryLimits(members["within-webcodecs-vp9.wasm"]),
    [{ imported: false, initialPages: 512, maximumPages: 512, shared: false }]);
  await mkdir(target); identity = await lstat(target, { bigint: true });
  for (const [file, bytes] of Object.entries(members)) await writeFile(path.join(target, file), bytes, { flag: "wx" });
  const report = { runId, head: dispatch.head, status: "authenticated-compiled-private-tool-not-browser-acceptance",
    artifact: { id: artifact.id, bytes: zip.length, sha256: sha(zip), expiresAt: artifact.expires_at }, nativeContract: contract,
    retainedDirectory: path.relative(root, target).replaceAll("\\", "/"),
    retainedPurpose: "One reusable private source-built tool for the next genuine browser qualification; delete when superseded or no longer used",
    retainedBytes: total, nativeContractSha256: sha(members["native-contract.json"]), originalRead: false,
    publicAssetReplacement: false, completeChromiumMemoryMeasured: false, speedGainProven: false, publicAcceptance: false };
  await writeFile(path.join(target, "owned-input.json"), JSON.stringify({ runId, head: dispatch.head, dev: String(identity.dev), ino: String(identity.ino) }) + "\n", { flag: "wx" });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); retained = true;
  console.log(JSON.stringify({ output, retainedDirectory: report.retainedDirectory, retainedBytes: total, wasm: contract.artifacts["within-webcodecs-vp9.wasm"],
    completeChromiumMemoryMeasured: false, publicAcceptance: false }));
} finally {
  if (identity && !retained) {
    const current = await lstat(target, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    assert.ok(!current.isSymbolicLink()); assert.equal(await realpath(target), target);
    await rm(target, { recursive: true, force: true });
  }
  await runtime.close();
}
