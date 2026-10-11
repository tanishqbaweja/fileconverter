// Same verified-local/source/head/id/digest deletion gate; never delete local tools.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runId = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(runId ?? "", /^\d{8,}$/);
const sourcePath = "scripts/cleanup-alignment16-hosted-artifact.mjs", source = await readFile(path.join(root, sourcePath), "utf8");
const edits = [
  ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(root)}`],
  ["evidence/mpeg2-alignment16-hosted-cleanup-${runId}.json", "evidence/mpeg2-hevc-plane-hosted-cleanup-${runId}.json"],
  ["evidence/mpeg2-alignment16-build-${runId}.json", "evidence/mpeg2-hevc-plane-build-${runId}.json"],
  ["actual-alignment16-build-unit-verified-not-browser-acceptance", "actual-hevc-plane-build-unit-verified-not-browser-acceptance"],
  ["work/mpeg2-alignment16-${runId}", "work/mpeg2-hevc-planes-${runId}"],
  ["alignment16-remote-clean-", "hevc-plane-remote-clean-"],
];
for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
  edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`)]);
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source, "No destructive ownership/digest/recoverability gate changed");
const runtime = await createOwnedRuntimeScratch("hevc-plane-clean-caller-");
try { const file = path.join(runtime.directory, "cleanup.mjs"); await writeFile(file, generated, { flag: "wx" }); await import(pathToFileURL(file).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
assert.equal(sha(await readFile(path.join(root, sourcePath))), sha(source));
const output = `evidence/hevc-plane-cleanup-executed-source-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), sourcePath, sourceSha256: sha(source), sourcePreimage: Buffer.from(source).toString("base64"),
  generatedSource: generated, generatedSha256: sha(generated), edits, reverseExact: true, ownedRuntimeRemoved: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output }));
