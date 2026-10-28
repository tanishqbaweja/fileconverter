// Reuse proven byte-equal source builds; no source recompile, browser or conversion.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, chmod, lstat, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "./source-pins.mjs";
import { bindgenTool, verifyBindgenVersion, compareStaticAbi, experimentalMaximumBytes, publishedSha256 } from "./postprocess-contract.mjs";
import { compileContract } from "./compile-contract.mjs";
import { boundPrivateMemory } from "./bound-private-memory.mjs";
import { definedWasmMemories } from "./memory-contract.mjs";
assert.equal(process.platform, "linux"); assert.equal(process.argv.length, 2); assert.match(process.env.GITHUB_RUN_ID ?? "", /^[0-9]+$/);
const root = path.resolve(import.meta.dirname, "../.."), runId = process.env.GITHUB_RUN_ID;
const output = path.join(root, "outputs/reports"), stem = `resvg-source-processed-repeat-${runId}`, reportFile = path.join(output, stem + ".json");
const inputPin = JSON.parse(await readFile(path.join(root, "images/resvg-source/remapped-raw-input.json")));
const report = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), status: "running", sourcePins: {}, commands: [], failures: [],
  scope: "Two pinned bindgen/cap passes after proven two-fresh-build raw source equality, before browser qualification/public promotion",
  inputPin, bindgenTool, experimentalMaximumBytes, variants: [], sourceRecompileAttempted: false,
  rendererExecuted: false, browserMemoryOrFidelityAcceptance: false, exactOldPublishedReproduction: false,
  publicEngineReplacement: false, originalGoalComplete: false };
const sources = ["images/resvg-source/postprocess-repeated-source.mjs", "images/resvg-source/remapped-raw-input.json",
  "images/resvg-source/postprocess-contract.mjs", "images/resvg-source/raw-candidate-input.json", "images/resvg-source/bindgen-toolchain.json",
  "images/resvg-source/bound-private-memory.mjs", "images/resvg-source/memory-contract.mjs", "images/resvg-source/published-version-witnesses.mjs",
  "images/resvg-source/source-pins.mjs", "images/resvg-source/compile-contract.mjs", ".github/workflows/svg-source-postprocess-repeat.yml"];
let runtime, activeChild;
const run = async (command, args, { input, maximum = 32768 } = {}) => {
  const record = { command, args, startedAt: new Date().toISOString(), exitCode: null, signal: null }; report.commands.push(record);
  activeChild = spawn(command, args, { cwd: root, env: runtime.env, windowsHide: true, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
  const child = activeChild; let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), exceeded = false;
  child.stdout.on("data", bytes => { if (stdout.length + bytes.length > maximum) exceeded = true;
    else if (!exceeded) stdout = Buffer.concat([stdout, bytes]); });
  child.stderr.on("data", bytes => { stderr = Buffer.concat([stderr, bytes]).subarray(-16384); });
  if (input) { child.stdin.on("error", () => {}); child.stdin.end(input); }
  const code = await new Promise((resolve, reject) => { child.once("error", reject);
    child.once("close", (code, signal) => { record.signal = signal; resolve(code); }); });
  record.exitCode = code; record.finishedAt = new Date().toISOString(); assert.equal(record.signal, null);
  assert.equal(code, 0, `${command} exited ${code}: ${stderr}`); assert.equal(exceeded, false); return stdout;
};
const boundedDownload = async (url, maximum) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200);
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) { bytes += chunk.length; assert.ok(bytes <= maximum); chunks.push(chunk); }
  return Buffer.concat(chunks);
};
try {
  await mkdir(output, { recursive: true }); await assert.rejects(access(reportFile), { code: "ENOENT" });
  for (const file of sources) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);
  const published = await readFile(path.join(root, "public/engines/svg/resvg.wasm")); assert.equal(sha(published), publishedSha256);
  runtime = await createOwnedRuntimeScratch("resvg-process-repeat-");
  report.executedHead = (await run("git", ["rev-parse", "HEAD"])).toString().trim(); assert.match(report.executedHead, /^[a-f0-9]{40}$/);
  const artifact = await run("gh", ["api", `repos/tanishqbaweja/fileconverter/actions/artifacts/${inputPin.artifactId}/zip`], { maximum: 2 * 1024 ** 2 });
  assert.equal(artifact.length, inputPin.artifactBytes); assert.equal(sha(artifact), inputPin.artifactSha256);
  const archiveFile = path.join(runtime.directory, "input.zip"); await writeFile(archiveFile, artifact, { flag: "wx" });
  const names = (await run("unzip", ["-Z1", archiveFile])).toString().trim().split(/\r?\n/);
  assert.deepEqual(names.sort(), inputPin.members.map(row => row.name).sort(), "Exact raw-repeat artifact members, no duplicates or paths");
  const members = new Map();
  for (const item of inputPin.members) {
    const bytes = await run("unzip", ["-p", archiveFile, item.name], { maximum: item.name.endsWith(".wasm") ? 16 * 1024 ** 2 : 262144 });
    assert.equal(bytes.length, item.bytes); assert.equal(sha(bytes), item.sha256); members.set(item.name, bytes);
  }
  const sourceRepeat = JSON.parse(members.get(inputPin.summaryMember));
  assert.equal(sourceRepeat.rawBytesEqual, true); assert.equal(sourceRepeat.builds.length, 2);
  assert.equal(sourceRepeat.ownedDriverScratchRemoved, true); assert.equal(sourceRepeat.secondOwnedRawAndLockRemovedAfterExactVerification, true);
  assert.deepEqual(sourceRepeat.failures, []); assert.notEqual(sourceRepeat.builds[0].runtimeFromReceipt, sourceRepeat.builds[1].runtimeFromReceipt);
  const raw = members.get(inputPin.wasmMember); assert.ok(WebAssembly.validate(raw));
  assert.equal(raw.includes(Buffer.from("/resvg-source-compile-")), false); assert.ok(raw.includes(Buffer.from("/within/resvg-build")));
  for (const name of inputPin.compilerReceiptMembers) {
    const receipt = JSON.parse(members.get(name)); assert.equal(receipt.executedHead, inputPin.headSha);
    assert.equal(receipt.sourceCompilationSucceeded, true); assert.equal(receipt.ownedScratchRemoved, true); assert.deepEqual(receipt.failures, []);
    assert.equal(receipt.rawWasm.sha256, sha(raw)); assert.equal(receipt.lock.sha256, sha(members.get(inputPin.lockMember)));
    assert.equal(receipt.rustcVersion, compileContract.rustcVersion); assert.deepEqual(receipt.commands.at(-1).args, [...compileContract.command]);
  }
  report.twoSourceBuildReceiptsAndRawEqualityVerified = true;
  const compressed = await boundedDownload(bindgenTool.archiveUrl, bindgenTool.maximumCompressedBytes);
  assert.equal(compressed.length, bindgenTool.archiveBytes); assert.equal(sha(compressed), bindgenTool.archiveSha256);
  const tar = gunzipSync(compressed, { maxOutputLength: bindgenTool.maximumExpandedBytes });
  const toolMembers = (await run("tar", ["-tf", "-"], { input: tar })).toString().trim().split(/\r?\n/);
  assert.equal(toolMembers.filter(name => name === bindgenTool.executableMember).length, 1);
  const tool = path.join(runtime.directory, "wasm-bindgen");
  await writeFile(tool, await run("tar", ["-xOf", "-", bindgenTool.executableMember], { input: tar, maximum: bindgenTool.maximumExpandedBytes }), { flag: "wx" });
  assert.ok((await lstat(tool)).isFile()); await chmod(tool, 0o755);
  report.toolVersion = (await run(tool, ["--version"])).toString().trim(); verifyBindgenVersion(report.toolVersion);
  const rawFile = path.join(runtime.directory, "raw.wasm"); await writeFile(rawFile, raw, { flag: "wx" });
  let first;
  for (const index of [1, 2]) {
    const directory = path.join(runtime.directory, "processed-" + index); await mkdir(directory);
    await run(tool, [rawFile, "--target", "web", "--out-dir", directory, "--out-name", "index"]);
    const binaryFile = path.join(directory, "index_bg.wasm"), glueFile = path.join(directory, "index.js");
    assert.ok((await lstat(binaryFile)).size <= 16 * 1024 ** 2); assert.ok((await lstat(glueFile)).size <= 262144);
    const processed = await readFile(binaryFile), glue = await readFile(glueFile), bounded = boundPrivateMemory(processed, experimentalMaximumBytes);
    const abi = compareStaticAbi(published, bounded.bytes); assert.equal(abi.namesAndKindsEqual, true);
    report.variants.push({ index, processedBytes: processed.length, processedSha256: sha(processed),
      boundedBytes: bounded.bytes.length, boundedSha256: sha(bounded.bytes), glueBytes: glue.length, glueSha256: sha(glue),
      memory: definedWasmMemories(bounded.bytes), memoryBoundProof: bounded.proof, staticAbi: abi });
    if (!first) first = { wasm: bounded.bytes, glue };
    else { assert.deepEqual(bounded.bytes, first.wasm, "Compare full bounded Wasm bytes"); assert.deepEqual(glue, first.glue, "Compare full generated glue bytes"); }
  }
  report.processedWasmAndGlueByteIdentical = true;
  report.candidate = { wasm: stem + ".wasm", wasmBytes: first.wasm.length, wasmSha256: sha(first.wasm),
    glue: stem + ".mjs", glueBytes: first.glue.length, glueSha256: sha(first.glue),
    defaultGlueWasmUrl: "index_bg.wasm", initializationRequiresExplicitWasmUrl: true };
  await writeFile(path.join(output, report.candidate.wasm), first.wasm, { flag: "wx" });
  await writeFile(path.join(output, report.candidate.glue), first.glue, { flag: "wx" });
  report.status = "repeated-source-and-processed-private-candidate-byte-identical-before-browser-acceptance";
} catch (error) { report.status = "failed-private-source-postprocess-repeat"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    assert.ok(!activeChild || activeChild.pid === undefined || (activeChild.exitCode !== null && activeChild.signalCode === null));
    await runtime?.close(); report.ownedScratchRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
    assert.equal(sha(await readFile(path.join(root, "public/engines/svg/resvg.wasm"))), publishedSha256); report.publicEngineUnchanged = true;
  } catch (error) { report.failures.push("Owned cleanup/source verification: " + error); report.status = "failed-private-source-postprocess-repeat"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: path.relative(root, reportFile), status: report.status,
    processedEqual: report.processedWasmAndGlueByteIdentical ?? false, ownedScratchRemoved: report.ownedScratchRemoved, failures: report.failures }));
}
