// Exact executed native source preimages, in two independently bounded layers.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), read = file => readFile(path.join(root, file));
const proofPath = "evidence/mpeg2-jspi-build-39072949964.json", proofBytes = await read(proofPath), build = JSON.parse(proofBytes);
const branchPath = "evidence/mpeg2-jspi-build-branch-2026-10-18.json", branchBytes = await read(branchPath), branch = JSON.parse(branchBytes);
assert.equal(build.run.headSha, "92fd31faa8ca1ce2e7040606fef435cc8f2f6d41"); assert.equal(branch.commit, build.run.headSha);
assert.equal(build.run.conclusion, "success"); assert.equal(branch.remoteVerified, true);
const parent = JSON.parse(await read("evidence/mpeg2-duration-drain-build-38678806473.json"));
const parentFiles = Object.keys(parent.manifest.sources), extraFiles = Object.keys(build.manifest.sources).filter(file => !parentFiles.includes(file));
assert.equal(parentFiles.length, 126); assert.equal(extraFiles.length, 6); assert.equal(Object.keys(build.manifest.sources).length, 132);
const layers = [];
for (const [label, files] of [["parent", parentFiles], ["jspi-extension", extraFiles]]) {
  assert.ok(files.length <= 128); const preimages = {}, currentSourcePins = {}, sourcePins = {};
  // Bound subprocess concurrency as well as each source/file/envelope size.
  for (let index = 0; index < files.length; index += 8) {
    const rows = await Promise.all(files.slice(index, index + 8).map(async file => {
      assert.ok(!file.includes("..") && !path.isAbsolute(file));
      const { stdout } = await execute("git", ["show", `${build.run.headSha}:${file}`],
        { cwd: root, windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 262144 });
      assert.equal(sha(stdout), build.manifest.sources[file], file);
      const current = await read(file);
      if (file === branch.workflow.path) {
        assert.equal(stdout.toString(), branch.workflow.generatedExactSource); assert.equal(sha(current), branch.workflow.canonicalSha256);
      } else assert.equal(sha(current), sha(stdout), file);
      return { file, executed: stdout, current };
    }));
    for (const row of rows) { sourcePins[row.file] = sha(row.executed); currentSourcePins[row.file] = sha(row.current); preimages[row.file] = row.executed.toString("base64"); }
  }
  const raw = Buffer.from(JSON.stringify({ sourcePins, currentSourcePins, preimages })); assert.ok(raw.length <= 2097152);
  const zipped = gzipSync(raw, { level: 9 }), archivePath = `outputs/reports/jspi-native-${label}-sources-39072949964.json.gz`;
  await writeFile(path.join(root, archivePath), zipped, { flag: "wx" }); assert.deepEqual(gunzipSync(await read(archivePath)), raw);
  layers.push({ label, sourceCount: files.length, sourcePins, currentSourcePins,
    archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: raw.length, restoredSha256: sha(raw) } });
}
const slot = "work/mpeg2-jspi-39072949964", binary = await read(`${slot}/within-mpeg2-split.wasm`);
const oldBinary = await read("work/mpeg2-duration-drain-38678806473/within-mpeg2-split.wasm");
const expected = new Map([["av_buffer_allocz", [1,1]], ["av_malloc", [1,1]], ["av_refstruct_pool_get", [1,1]], ["mpeg2_packets", [2,1]],
  ["__wrap_posix_memalign", [2,1]], ["sbrk", [1,1]], ["emscripten_builtin_malloc", [1,1]], ["emscripten_builtin_realloc", [2,1]],
  ["av_buffer_realloc", [2,1]], ["__wrap_av_realloc", [2,1]], ["__wrap_av_buffer_realloc", [2,1]]]);
const metadata = bytes => readWasmFunctionMetadata(bytes, new Set(expected.keys())).map(row => {
  const [params, results] = expected.get(row.name); assert.deepEqual(row.params, Array(params).fill("i32")); assert.deepEqual(row.results, Array(results).fill("i32"));
  return { ...row, bodySha256: sha(bytes.subarray(row.bodyStart, row.bodyEnd)) };
});
const functions = metadata(binary), parentFunctions = metadata(oldBinary);
const layout = {};
const map = (await read(`${slot}/decoder-link.map`)).toString();
for (const symbol of ["_gm_", "within_allocator_attempt_words", "within_realloc_attempt_words", "within_refstruct_abort_words"]) {
  const matches = [...map.matchAll(new RegExp(`^\\s*([a-f0-9]+)\\s+[a-f0-9-]+\\s+([a-f0-9]+)\\s+${symbol}$`, "gm"))];
  assert.equal(matches.length, 1, symbol); layout[symbol] = { address: parseInt(matches[0][1], 16), bytes: parseInt(matches[0][2], 16) };
}
assert.deepEqual(layout, { _gm_: { address: 1786904, bytes: 496 }, within_allocator_attempt_words: { address: 1918992, bytes: 64 },
  within_realloc_attempt_words: { address: 1919056, bytes: 64 }, within_refstruct_abort_words: { address: 1919120, bytes: 64 } });
const own = "scripts/retain-jspi-native-sources.mjs", ownBytes = await read(own), output = "evidence/jspi-native-sources-39072949964.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), status: "executed-jspi-native-sources-and-static-abi-verified-not-browser-acceptance",
  proof: { path: proofPath, sha256: sha(proofBytes) }, branch: { path: branchPath, sha256: sha(branchBytes) }, executedHead: build.run.headSha,
  layers, sourceCount: 132, allSourcesMatchedExecutedGitHead: true, workflowCanonicalDiffOnly: true,
  decoder: { sha256: sha(binary), bytes: binary.length }, layout, functions, parentFunctions,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") },
  originalRead: false, conversions: 0, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: 132, layers: layers.map(row => ({ label: row.label, sourceCount: row.sourceCount, archiveBytes: row.archive.bytes })), layout }));
