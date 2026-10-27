// Build-time processing of a genuine source artifact. No user files or renderer execution.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, statfs, access, chmod, lstat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "./source-pins.mjs";
import { rawInput, bindgenTool, experimentalMaximumBytes, publishedSha256, verifySourceReceipt, requireArtifactMembers, compareStaticAbi } from "./postprocess-contract.mjs";
import { boundPrivateMemory } from "./bound-private-memory.mjs";
import { definedWasmMemories } from "./memory-contract.mjs";

assert.equal(process.platform, "linux", "Isolated Linux build postprocessor, not local conversion");
assert.equal(process.argv.length, 2); assert.match(process.env.GITHUB_RUN_ID ?? "", /^[0-9]+$/);
const root = path.resolve(import.meta.dirname, "../.."), runId = process.env.GITHUB_RUN_ID;
const output = path.join(root, "outputs/reports"), stem = `resvg-postprocess-${runId}`;
const reportFile = path.join(output, stem + ".json");
const report = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), status: "running", rawInput, bindgenTool,
  scope: "Private source-built SVG postprocessing; experimental cap, before rendering/fidelity/process-tree qualification",
  experimentalMaximumBytes, sourcePins: {}, commands: [], failures: [],
  sourceRecompileAttempted: false, userFileOrProtectedOriginalAccessed: false, rendererInstantiated: false,
  browserOrProcessMemoryAcceptance: false, exactPublishedReproduction: false, publicEngineReplacement: false, originalGoalComplete: false };
const sourceFiles = ["images/resvg-source/postprocess-candidate.mjs", "images/resvg-source/postprocess-contract.mjs",
  "images/resvg-source/bound-private-memory.mjs", "images/resvg-source/memory-contract.mjs",
  "images/resvg-source/published-version-witnesses.mjs", "images/resvg-source/source-pins.mjs",
  "images/resvg-source/compile-contract.mjs", "images/resvg-source/raw-candidate-input.json",
  "images/resvg-source/bindgen-toolchain.json", ".github/workflows/ci.yml"];
let runtime, activeChild;
const run = async (command, args, { input, maximum = 32768 } = {}) => {
  const record = { command, args, startedAt: new Date().toISOString(), exitCode: null, signal: null };
  report.commands.push(record);
  const child = activeChild = spawn(command, args, { cwd: root, env: runtime.env, windowsHide: true, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), exceeded = false;
  child.stdout.on("data", bytes => { if (stdout.length + bytes.length > maximum) exceeded = true;
    else if (!exceeded) stdout = Buffer.concat([stdout, bytes]); });
  child.stderr.on("data", bytes => { stderr = Buffer.concat([stderr, bytes]).subarray(-16384); });
  if (input) { child.stdin.on("error", () => {}); child.stdin.end(input); }
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => { record.signal = signal; resolve(code); });
  });
  record.exitCode = code; record.finishedAt = new Date().toISOString();
  assert.equal(record.signal, null, "Signal termination is not clean completed build evidence");
  assert.equal(code, 0, `${command} exited ${code}: ${stderr}`); assert.equal(exceeded, false, "Bounded command capture exceeded");
  return stdout;
};
const boundedDownload = async (url, maximum) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200);
  const chunks = []; let total = 0;
  for await (const bytes of response.body) { total += bytes.length; assert.ok(total <= maximum); chunks.push(bytes); }
  return Buffer.concat(chunks);
};
try {
  await mkdir(output, { recursive: true }); await assert.rejects(access(reportFile), { code: "ENOENT" });
  for (const file of sourceFiles) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const published = await readFile(path.join(root, "public/engines/svg/resvg.wasm")); assert.equal(sha(published), publishedSha256);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);
  runtime = await createOwnedRuntimeScratch("resvg-postprocess-");
  report.executedHead = (await run("git", ["rev-parse", "HEAD"])).toString().trim(); assert.match(report.executedHead, /^[a-f0-9]{40}$/);
  const archive = await run("gh", ["api", `repos/tanishqbaweja/fileconverter/actions/artifacts/${rawInput.artifactId}/zip`], { maximum: 2 * 1024 ** 2 });
  assert.equal(archive.length, rawInput.artifactBytes); assert.equal(sha(archive), rawInput.artifactSha256);
  const zip = path.join(runtime.directory, "source.zip"); await writeFile(zip, archive, { flag: "wx" });
  const names = (await run("unzip", ["-Z1", zip])).toString().trim().split(/\r?\n/); requireArtifactMembers(names);
  const receiptBytes = await run("unzip", ["-p", zip, rawInput.receiptMember]); const receipt = verifySourceReceipt(receiptBytes);
  const lock = await run("unzip", ["-p", zip, rawInput.lockMember], { maximum: 262144 }); assert.equal(sha(lock), rawInput.lockSha256);
  const raw = await run("unzip", ["-p", zip, rawInput.wasmMember], { maximum: 16 * 1024 ** 2 });
  assert.equal(raw.length, rawInput.wasmBytes); assert.equal(sha(raw), rawInput.wasmSha256); assert.ok(WebAssembly.validate(raw));
  report.sourceArtifactVerified = true; report.sourceCompileHead = receipt.executedHead;
  report.rawMemory = definedWasmMemories(raw);
  const toolArchive = await boundedDownload(bindgenTool.archiveUrl, bindgenTool.maximumCompressedBytes);
  assert.equal(toolArchive.length, bindgenTool.archiveBytes); assert.equal(sha(toolArchive), bindgenTool.archiveSha256);
  const tar = gunzipSync(toolArchive, { maxOutputLength: bindgenTool.maximumExpandedBytes });
  const members = (await run("tar", ["-tf", "-"], { input: tar })).toString().trim().split(/\r?\n/);
  assert.equal(members.filter(name => name === bindgenTool.executableMember).length, 1);
  const executable = await run("tar", ["-xOf", "-", bindgenTool.executableMember], { input: tar, maximum: bindgenTool.maximumExpandedBytes });
  const tool = path.join(runtime.directory, "wasm-bindgen"); await writeFile(tool, executable, { flag: "wx" });
  assert.ok((await lstat(tool)).isFile()); await chmod(tool, 0o755);
  report.toolVersion = (await run(tool, ["--version"])).toString().trim(); assert.equal(report.toolVersion, "wasm-bindgen 0.2.92");
  const input = path.join(runtime.directory, "raw.wasm"), processed = path.join(runtime.directory, "processed");
  await writeFile(input, raw, { flag: "wx" }); await mkdir(processed);
  await run(tool, [input, "--target", "web", "--out-dir", processed, "--out-name", "index"]);
  const candidatePath = path.join(processed, "index_bg.wasm");
  assert.ok((await lstat(candidatePath)).size <= 16 * 1024 ** 2);
  const candidate = await readFile(candidatePath), jsPath = path.join(processed, "index.js");
  assert.ok((await lstat(jsPath)).size <= 256 * 1024); const glue = await readFile(jsPath);
  report.processed = { bytes: candidate.length, sha256: sha(candidate), memory: definedWasmMemories(candidate), glueBytes: glue.length, glueSha256: sha(glue) };
  report.staticAbi = compareStaticAbi(published, candidate);
  const bounded = boundPrivateMemory(candidate, experimentalMaximumBytes); report.memoryBoundProof = bounded.proof;
  report.boundedMemory = definedWasmMemories(bounded.bytes);
  report.candidate = { wasm: stem + ".wasm", wasmBytes: bounded.bytes.length, wasmSha256: sha(bounded.bytes),
    glue: stem + ".mjs", glueBytes: glue.length, glueSha256: sha(glue), defaultGlueWasmUrl: "index_bg.wasm",
    initializationRequiresExplicitWasmUrl: true };
  await writeFile(path.join(output, report.candidate.wasm), bounded.bytes, { flag: "wx" });
  await writeFile(path.join(output, report.candidate.glue), glue, { flag: "wx" });
  report.status = "processed-private-source-candidate-not-rendering-or-browser-acceptance";
} catch (error) { report.status = "failed-private-postprocessing"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!activeChild || activeChild.pid === undefined || (activeChild.exitCode !== null && activeChild.signalCode === null), "Never clean scratch of live or signal-terminated build tool");
    await runtime?.close(); report.ownedScratchRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
    assert.equal(sha(await readFile(path.join(root, "public/engines/svg/resvg.wasm"))), publishedSha256);
    report.publicSvgUnchanged = true;
  } catch (error) { report.failures.push("Owned cleanup/source verification: " + error); report.status = "failed-private-postprocessing"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: path.relative(root, reportFile), status: report.status, ownedScratchRemoved: report.ownedScratchRemoved, failures: report.failures }));
}
