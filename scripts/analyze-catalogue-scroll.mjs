import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
// Replay the actual Playwright evaluation results: preserve all text and all
//258element box dimensions, distinguish viewport translation from changed layout.
async function inspectScrollLayoutTrace() {
  const file = path.join(root, "outputs/reports/2026-10-17T18-07-00-739Z-private-mpeg2-updated-chrome-full-native-100ms-trace.zip");
  const command = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.IO.Compression.FileSystem;$scrollArchive=[IO.Compression.ZipFile]::OpenRead('" + file.replaceAll("'", "''") + "');try{$scrollReader=[IO.StreamReader]::new($scrollArchive.GetEntry('trace.trace').Open());try{[Console]::Write($scrollReader.ReadToEnd())}finally{$scrollReader.Dispose()}}finally{$scrollArchive.Dispose()}";
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
  const decode = value => "s" in value ? value.s : "n" in value ? value.n : value.a ? value.a.map(decode) : value.o ? Object.fromEntries(value.o.map(row => [row.k, decode(row.v)])) : value.v;
  const layouts = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line); if (row.type !== "after" || !row.result?.value?.o?.some(field => field.k === "boxes")) continue;
    layouts.push(decode(row.result.value));
  }
  assert.equal(layouts.length, 2); assert.equal(layouts[0].text, layouts[1].text); assert.equal(layouts[0].boxes.length, layouts[1].boxes.length);
  for (let index = 0; index < layouts[0].boxes.length; index++) {
    const before = layouts[0].boxes[index], after = layouts[1].boxes[index];
    assert.deepEqual([before[0], before[1], before[3], before[4]], [after[0], after[1], after[3], after[4]]);
    assert.equal(after[2] - before[2], 2);
  }
  return { elements: layouts[0].boxes.length, textIdentical: true, xWidthHeightIdentical: true,
    everyViewportYShiftExactlyPixels: 2, geometryAcceptancePassed: false, abaCompleted: false,
    note: "Original exact viewport check failed and remains failed. Replay attributes it to a uniform2px scroll offset, not resized/reflowed elements. No auto-scroll candidate retained; no retry justified by tile results." };
}
globalThis.__catalogueScrollLayoutProof = await inspectScrollLayoutTrace();
const source = await readFile(path.join(root, "scripts/analyze-catalogue-navigation.mjs"), "utf8");
let generated = exactPatch(source, [
  ['import { inspectCatalogueNavigation } from "./lib/catalogue-navigation-observation.mjs";', 'import { inspectCatalogueScrollDiagnostic as inspectCatalogueNavigation } from "./lib/catalogue-scroll-observation.mjs";'],
  ['"evidence/2026-10-17T17-52-52-402Z-catalogue-navigation-control-terminal.json"', '"evidence/2026-10-17T18-06-27-397Z-catalogue-scroll-control-terminal.json"'],
  ['Object.keys(source.pins).length, 808', 'Object.keys(source.pins).length, 811'],
  ['"scripts/analyze-catalogue-navigation.mjs", "scripts/lib/catalogue-navigation-observation.mjs", "tests/catalogue-navigation-observation.test.mjs"',
    '"scripts/analyze-catalogue-scroll.mjs", "scripts/lib/catalogue-scroll-observation.mjs", "tests/catalogue-scroll-observation.test.mjs"'],
  ['all808ExecutedCurrentPostPinsEqual: true', 'all811ExecutedCurrentPostPinsEqual: true'],
  ['const result = { recordedAt:', 'const result = { layoutReplay:globalThis.__catalogueScrollLayoutProof, recordedAt:'],
  ['"evidence/2026-10-17-catalogue-navigation-independent-analysis.json"', '"evidence/2026-10-17-catalogue-scroll-independent-analysis.json"'],
  ['Observed transient cc/tile_memory and GPU shared_images expand on navigation and shrink on idle. Test a narrowly scoped scroll-animation candidate in a within-session default/auto/default UI comparison before conversion qualification. Do not claim the earlier conversion peak callsite is proved, force GC, omit processes or change codec/media fidelity.',
    'Do not retain or repeat auto-scroll: no observed tile reduction and ABA incomplete. Keep viewport failure as failure, with exact trace attribution to2px scroll offset. Investigate bounded catalogue DOM/fiber reuse next without changing conversion thresholds or repeating multi-hour stress.'],
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
]).generated;
generated = generated.replaceAll(/from "(\.\/lib\/[^"\n]+)"/g, (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`);
try { await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`); }
finally { delete globalThis.__catalogueScrollLayoutProof; }
