// Exact pre-telemetry inputs only for archived run provenance, never live policy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { readPreOgSecurityInput } from "./pre-og-security-inputs.mjs";
const pins = { "workers/conversion.worker.ts": "d69832342be0757422d3e87d182c9daf2d13f08648720a959c1df85142d108c7",
  "app/converter/ConverterApp.tsx": "7ae964f6acdc50f7746d3b04a3717f2a18563216af9a11910a5e3b8aae22b9f3" };
export async function readPreSvgMemoryInput(file) {
  if (!Object.hasOwn(pins, file)) return readPreOgSecurityInput(file);
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-svg-memory-observation-2026-10-28.json", import.meta.url)));
  assert.equal(archive.sourceCommit, "e0094b81");
  const entry = archive.files[file], bytes = gunzipSync(Buffer.from(entry.gzipBase64, "base64"), { maxOutputLength: 262144 });
  assert.equal(bytes.length, entry.bytes); assert.equal(entry.sha256, pins[file]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pins[file]); return bytes;
}
