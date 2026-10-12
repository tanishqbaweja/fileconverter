// Static examination of the exact executed glue, NOT a measured malloc argument.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = "2026-10-12T10-18-33-321Z", read = file => readFile(path.join(root, file));
const terminalPath = `evidence/${stamp}-packet-cache-original-full-terminal.json`, terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const file = "work/mpeg2-packet-cache-38206263853/within-mpeg2-split.mjs", bytes = await read(file), text = bytes.toString("utf8");
const hash = terminal.composition.manifest.artifacts["within-mpeg2-split.mjs"]; assert.equal(sha(bytes), hash);
assert.equal(hash, "c819ad21398ebf90dac4b58588969221cdcf21ef0d208492cc43c81dd923f85a");
const allocation = "allocateData(){var ptr=_malloc(12+Asyncify.StackSize);";
assert.equal(text.split(allocation).length - 1, 1);
assert.equal(text.split("StackSize:262144").length - 1, 1);
const free = "_free(Asyncify.currData);Asyncify.currData=null;"; assert.equal(text.split(free).length - 1, 1);
const fragments = ["StackSize:262144", allocation, free].map(anchor => {
  const offset = text.indexOf(anchor); return { anchor, characterOffset: offset, sourceExcerpt: text.slice(Math.max(0, offset - 80), offset + 500) };
});
const own = "scripts/inspect-packet-cache-asyncify-storage.mjs", ownBytes = await read(own);
const proof = { recordedAt: new Date().toISOString(), status: "exact-generated-asyncify-storage-static-inspection-not-runtime-allocation-proof",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, artifact: { path: file, bytes: bytes.length, sha256: hash }, fragments,
  compiledStackSizeBytes: 262144, headerBytes: 12, staticallyConfiguredAllocationBytes: 262156,
  staticStackSizeAssignmentCount: [...text.matchAll(/Asyncify\.StackSize\s*=/g)].length,
  observedFailedIndividualAllocationBytes: null, heapLiveBytes: null, fragmentationCauseProven: false,
  currentBehavior: "Glue requests malloc(12+Asyncify.StackSize) on allocateData and frees currData when rewind finishes",
  nextCandidate: "Bounded one reusable suspension-storage lease with lifecycle/reentrancy/zeroing/failure qualification; keep fixed Wasm limits and all media gates",
  originalFileRead: false, wasmExecuted: false, browserConversionPerformed: false, noBinaryOrRuntimeChanged: true,
  noWholeHeapRead: true, publicAcceptance: false, speedGainProven: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
const output = `evidence/${stamp}-asyncify-storage-static.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, configuredSuspensionBytes: 262156, measuredFailedAllocationBytes: null }));
