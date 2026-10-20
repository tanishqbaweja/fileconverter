// Preserve the original live-source equality gate separately from historical
// output evidence. New production code must not rewrite an old receipt's pins.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("October-10 AIFF stress live-source identity is not implied by portable historical evidence", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-10T08-18-49-643Z-aiff-id3-sync-opfs-stress.json"));
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
});
