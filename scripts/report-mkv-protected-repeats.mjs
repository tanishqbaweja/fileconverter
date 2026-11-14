// Render compact derived artifacts from immutable evidence; never run media.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderProtectedRepeatReport } from "./lib/mkv-protected-repeat-report.mjs";

assert.equal(process.argv.length, 3);
const root = path.resolve(import.meta.dirname, ".."), input = process.argv[2];
assert.match(input, /^evidence\/\d{4}-\d\d-\d\dT[\dZ-]+-mkv-exact-aac-protected-repeats\.json$/);
const report = JSON.parse(await readFile(path.join(root, input), "utf8"));
for (const [extension, bytes] of Object.entries(renderProtectedRepeatReport(report))) {
  const output = input.replace(/\.json$/, `.${extension}`);
  await writeFile(path.join(root, output), bytes, { flag: "wx" });
  console.log(output);
}
