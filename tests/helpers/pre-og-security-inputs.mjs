// Archived dependency inputs for old receipts only. New live policy reads disk.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { readPreCiRuntimeInput } from "./pre-ci-runtime-inputs.mjs";
const pins={"package.json":"c13423c98132f9f1beaf9cdea8ceadf3436f7cf94031c873cc150f743bd5978c","package-lock.json":"b2c97a14d64528607b8acd6394350ea741db853de36fcd2f4d46789c4b3964a4"};
export async function readPreOgSecurityInput(file,options){
  if(!Object.hasOwn(pins,file))return readPreCiRuntimeInput(file,options);
  const archive=JSON.parse(await readFile(new URL("../../fixtures/source/pre-og-security-patch-2026-10-29.json",import.meta.url)));
  assert.equal(archive.sourceCommit,"c28d1bcf");const entry=archive.files[file];
  const bytes=gunzipSync(Buffer.from(entry.gzipBase64,"base64"),{maxOutputLength:1048576});
  assert.equal(bytes.length,entry.bytes);assert.equal(entry.sha256,pins[file]);assert.equal(createHash("sha256").update(bytes).digest("hex"),pins[file]);return bytes;
}
