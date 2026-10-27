import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { recoverPublishedVersionWitnesses } from "../images/resvg-source/published-version-witnesses.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), binaryPath = path.join(root, "public/engines/svg/resvg.wasm");
assert.ok((await stat(binaryPath)).size <= 16 * 1024 * 1024);
const report = recoverPublishedVersionWitnesses(await readFile(binaryPath),
  await readFile(path.join(root, "images/resvg-source/Cargo.candidate.lock"), "utf8"));
report.observedAt = new Date().toISOString(); report.sourcePins = {};
for (const file of ["scripts/audit-resvg-version-witnesses.mjs", "images/resvg-source/published-version-witnesses.mjs"])
  report.sourcePins[file] = sha(await readFile(path.join(root, file)));
const relative = "evidence/" + new Date().toISOString().replaceAll(/[:.]/g, "-") + "-resvg-version-witnesses.json";
await writeFile(path.join(root, relative), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path: relative, summary: report.summary }));
