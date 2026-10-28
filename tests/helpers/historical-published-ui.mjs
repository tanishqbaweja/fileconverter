// Only historical experiment-recipe tests use these immutable preimages. Live
// application behavior must be tested against current files, never this helper.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readHistoricalCdpOrFile } from "./historical-cdp-realm.mjs";
const pins = new Map([
  ["app/converter/ConverterApp.tsx", [98758, "b93cb0095b0286f84e58fe8b9bc6ae4bc415b5487d9e06b0fc72f365f37bce6b"]],
  ["app/converter/PublishedFormatsCatalogue.tsx", [3388, "8dc2db01d843e00760ca04175f6e9f2e2e1b539466793b0be248bbc41996c6ba"]],
  ["app/globals.css", [19042, "474a7c3ae9eeae021b9e69a76201fcb115f6978e3b9152528ad906ac5855aa4a"]],
]);
export async function readPreCatalogueUi(file) {
  assert.ok(pins.has(file), "Only the three explicit historical UI sources are available");
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-catalogue-ui-2026-10-20.json", import.meta.url), "utf8"));
  assert.equal(archive.schemaVersion, 1); assert.equal(Object.keys(archive.files).length, 3);
  const entry = archive.files[file], [bytes, hash] = pins.get(file);
  assert.equal(entry.bytes, bytes); assert.equal(entry.sha256, hash);
  const compressed = Buffer.from(entry.gzipBase64, "base64"); assert.ok(compressed.length <= 65536);
  const source = gunzipSync(compressed, { maxOutputLength: 131072 });
  assert.equal(source.length, bytes); assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  return source.toString("utf8");
}

export async function readPreMpeg2JobWorker() {
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-mpeg2-job-worker-2026-10-21.json", import.meta.url), "utf8"));
  const hash = "6349cbe78fe0c3ece7c7f285a4eb1f8b6a09155ab9a9f44319f9d12566791d68";
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.path, "workers/conversion.worker.ts");
  assert.equal(archive.bytes, 168379); assert.equal(archive.sha256, hash);
  const compressed = Buffer.from(archive.gzipBase64, "base64"); assert.ok(compressed.length <= 65536);
  const source = gunzipSync(compressed, { maxOutputLength: 262144 });
  assert.equal(source.length, archive.bytes); assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  return source.toString("utf8");
}

export async function readPreSafetyPrivacySuite() {
  const archive = JSON.parse(await readFile(new URL("../../fixtures/source/pre-safety-privacy-suite-2026-10-21.json", import.meta.url), "utf8"));
  const hash = "348cc0aa666d382255a7b00fa0bca89300bf1aedef21fa4e61fc7e41802c8f5c";
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.path, "tests/browser/privacy-offline.spec.ts");
  assert.equal(archive.bytes, 58962); assert.equal(archive.sha256, hash);
  const compressed = Buffer.from(archive.gzipBase64, "base64"); assert.ok(compressed.length <= 16384);
  const source = gunzipSync(compressed, { maxOutputLength: 65536 });
  assert.equal(source.length, archive.bytes); assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  return source.toString("utf8");
}

// Explicit adapter for historical evidence tests: the three immutable UI
// preimages and the exact pre-MPEG2 job worker are archived. Other source pins keep
// their original reads/assertions, except the single exact historical CDP
// sampler now delegated to its independently pinned archive. Never live acceptance.
export async function readHistoricalUiOrArtifact(file, options) {
  const filePath = file instanceof URL ? fileURLToPath(file) : typeof file === "string" ? path.resolve(file) : null;
  const relative = filePath && path.relative(path.resolve(import.meta.dirname, "../.."), filePath).replaceAll("\\", "/");
  if (!pins.has(relative) && relative !== "workers/conversion.worker.ts") return readHistoricalCdpOrFile(file, options);
  const bytes = Buffer.from(relative === "workers/conversion.worker.ts" ? await readPreMpeg2JobWorker() : await readPreCatalogueUi(relative));
  const encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}
