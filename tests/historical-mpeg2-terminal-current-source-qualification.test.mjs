// Original live-source equalities remain runnable and intentionally separate
// from archived executed-preimage checks. No old source digest is rewritten.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
for (const [kind, file] of [
  ["clock", "evidence/2026-10-11T03-53-11-041Z-encoder-plane-clock-original-full-terminal-analysis.json"],
  ["bitrate", "evidence/2026-10-11T08-24-12-696Z-encoder-plane-bitrate-original-full-terminal-analysis.json"],
]) test(`${kind} historical terminal live-source equality is not implied by portable archive acceptance`, async () => {
  const analysis = JSON.parse(await read(file)), receipt = JSON.parse(await read(analysis.receipt.path));
  for (const [source, expected] of Object.entries(receipt.sourcePins)) assert.equal(sha(await read(source)), expected, source);
  for (const [source, expected] of Object.entries(analysis.analysisSourcePins)) assert.equal(sha(await read(source)), expected, source);
});
