// Read only bounded source spans while constructing full-file qualification.
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { deriveRecordedTimelineDriver } from "./lib/recorded-timeline-full-recipe.mjs";
const root = process.cwd();
const archive = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
const source = deriveRecordedTimelineDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-reviewFULL"), "allocation-attempt-media-reviewFULL", []).generated;
const lines = source.split(/\r?\n/);
let selected = [];
if (process.argv[2]?.includes(":")) {
  const [start, end] = process.argv[2].split(":").map(Number);
  if (!(start >= 1 && end >= start && end - start <= 200)) throw new Error("Bounded source span required");
  selected = Array.from({ length: Math.min(end, lines.length) - start + 1 }, (_, index) => start - 1 + index);
} else {
  const pattern = new RegExp(process.argv[2] ?? "for \\(let number|assert.deepEqual\\(forbidden|Asyncify|asyncify|run.independent|loadedIdle =|runs.length|diagnosticOnly|nativeValidation|run.recovery");
  const found = new Set();
  for (let index = 0; index < lines.length; index++) if (pattern.test(lines[index]))
    for (let next = Math.max(0, index - 1); next <= Math.min(lines.length - 1, index + 2); next++) found.add(next);
  selected = [...found].slice(0, 160);
}
console.log(selected.map(index => `${index + 1}: ${lines[index].length > 2000 ? `[omitted ${lines[index].length}-character literal]` : lines[index]}`).join("\n"));
