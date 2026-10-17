// Exact previously audited artifact cleanup, rebound only to the JSPI namespace.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/cleanup-alignment16-hosted-artifact.mjs"), "utf8");
let generated = source.replaceAll("alignment16", "jspi");
assert.equal(generated.replaceAll("jspi", "alignment16"), source);
generated = generated.replace('path.resolve(import.meta.dirname, "..")', JSON.stringify(root))
  .replace(/from "(\.[^"\r\n]+)"/g, (_, file) => "from " + JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href));
await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
