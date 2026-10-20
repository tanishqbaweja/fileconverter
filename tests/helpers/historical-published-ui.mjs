// Only historical experiment-recipe tests use these immutable preimages. Live
// application behavior must be tested against current files, never this helper.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

// Explicit adapter for historical evidence tests: only the three immutable UI
// preimages above are archived. All reports/native assets/other source pins keep
// their original filesystem reads and assertions. Never use for live acceptance.
export async function readHistoricalUiOrArtifact(file, options) {
  const filePath = file instanceof URL ? fileURLToPath(file) : typeof file === "string" ? path.resolve(file) : null;
  const relative = filePath && path.relative(path.resolve(import.meta.dirname, "../.."), filePath).replaceAll("\\", "/");
  if (!pins.has(relative)) return readFile(file, options);
  const bytes = Buffer.from(await readPreCatalogueUi(relative));
  const encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}
