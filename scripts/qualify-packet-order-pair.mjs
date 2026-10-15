// Supplemental matched browser pair: original four cases PLUS bounded packet hashes.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makePacketOrderMediaCaller } from "./lib/packet-order-pair-caller-recipe.mjs";
assert.equal(process.argv.length, 4);
const variant = process.argv[2]; assert.ok(["baseline", "candidate"].includes(variant));
process.env.WITHIN_PACKET_ORDER_VARIANT = variant;
process.argv.splice(2, 1);
const root = path.resolve(import.meta.dirname, "..");
const recipe = makePacketOrderMediaCaller(await readFile(path.join(root, "scripts/qualify-ebml-reuse-media.mjs"), "utf8"), root, variant);
const runtime = await createOwnedRuntimeScratch(`packet-order-${variant}-qualifier-`);
try {
  const file = path.join(runtime.directory, "qualifier.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
