// Exact source/head/id/digest gate; preserve local reusable tools and user data.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyReallocNativeEnvelope } from "./lib/realloc-native-envelope.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(runId ?? "", /^\d{8,}$/);
const buildBytes = await readFile(path.join(root, `evidence/mpeg2-realloc-attempt-build-${runId}.json`)), build = JSON.parse(buildBytes);
const branch = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json")));
const nativeEnvelope = await verifyReallocNativeEnvelope(root, build, buildBytes, branch);
const sourcePath = "scripts/cleanup-alignment16-hosted-artifact.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const edits = [
  ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(root)}`],
  ["evidence/mpeg2-alignment16-hosted-cleanup-${runId}.json", "evidence/mpeg2-realloc-attempt-hosted-cleanup-${runId}.json"],
  ["evidence/mpeg2-alignment16-build-${runId}.json", "evidence/mpeg2-realloc-attempt-build-${runId}.json"],
  ["actual-alignment16-build-unit-verified-not-browser-acceptance", "actual-realloc-scalar-build-unit-verified-not-browser-acceptance"],
  ["work/mpeg2-alignment16-${runId}", "work/mpeg2-realloc-attempt-${runId}"],
  ["alignment16-remote-clean-", "realloc-remote-clean-"],
];
for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
  edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`)]);
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
assert.equal(reverse, source, "No ownership/recoverability or destructive target gate changed");
const runtime = await createOwnedRuntimeScratch("realloc-artifact-clean-caller-");
try { const file = path.join(runtime.directory, "cleanup.mjs"); await writeFile(file, generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
assert.equal(sha(await readFile(path.join(root, sourcePath))), sha(source));
const output = `evidence/realloc-cleanup-executed-source-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), nativeEnvelope, sourcePath, sourceSha256: sha(source),
  sourcePreimage: Buffer.from(source).toString("base64"), generatedSource: generated, generatedSha256: sha(generated), edits,
  reverseExact: true, ownedRuntimeRemoved: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));
