// Same audited artifact identity/recoverability checks, with fresh native proof.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(runId ?? "", /^\d{8,}$/);
const read = file => readFile(path.join(root, file));
const nativePath = `evidence/ebml-reuse-native-${runId}.json`, nativeBytes = await read(nativePath), native = JSON.parse(nativeBytes);
assert.equal(native.sourceCount, 93); assert.equal(native.nativeLifecyclePassed, true);
assert.equal(native.allSourcesMatchedExecutedGitHead, true); assert.equal(native.workflowCanonicalDiffOnly, true);
assert.equal(native.allTwentyToolsMatched, true);
const buildBytes = await read(`evidence/mpeg2-ebml-reuse-build-${runId}.json`);
assert.equal(sha(buildBytes), native.proof.sha256);
const compressed = await read(native.archive.path); assert.equal(sha(compressed), native.archive.sha256);
const restored = gunzipSync(compressed, { maxOutputLength: 2097152 });
assert.equal(sha(restored), native.archive.restoredSha256);
const archive = JSON.parse(restored);
assert.deepEqual(archive.sourcePins, native.sourcePins); assert.deepEqual(archive.currentSourcePins, native.currentSourcePins);
for (const [file, expected] of Object.entries(native.currentSourcePins)) {
  assert.equal(sha(await read(file)), expected);
  assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), native.sourcePins[file]);
}
const sourcePath = "scripts/cleanup-alignment16-hosted-artifact.mjs", source = (await read(sourcePath)).toString();
const edits = [
  ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(root)}`],
  ["evidence/mpeg2-alignment16-hosted-cleanup-${runId}.json", "evidence/mpeg2-ebml-reuse-hosted-cleanup-${runId}.json"],
  ["evidence/mpeg2-alignment16-build-${runId}.json", "evidence/mpeg2-ebml-reuse-build-${runId}.json"],
  ["actual-alignment16-build-unit-verified-not-browser-acceptance", "actual-ebml-reuse-build-unit-verified-not-browser-acceptance"],
  ["work/mpeg2-alignment16-${runId}", "work/mpeg2-ebml-reuse-${runId}"],
  ["alignment16-remote-clean-", "ebml-reuse-remote-clean-"],
];
for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
  edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`)]);
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let reverse = generated;
for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
assert.equal(reverse, source, "Every target/source/head/id/digest/local recoverability gate preserved");
const runtime = await createOwnedRuntimeScratch("ebml-reuse-artifact-clean-");
try {
  const file = path.join(runtime.directory, "cleanup.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
assert.equal(sha(await read(sourcePath)), sha(source));
const own = "scripts/cleanup-ebml-reuse-hosted-artifact.mjs", ownBytes = await read(own);
const output = `evidence/ebml-reuse-cleanup-executed-source-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(),
  nativeProof: { path: nativePath, sha256: sha(nativeBytes) }, sourcePath, sourceSha256: sha(source),
  sourcePreimage: Buffer.from(source).toString("base64"), generatedSource: generated, generatedSha256: sha(generated), edits,
  reverseExact: true, ownedRuntimeRemoved: true, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));
