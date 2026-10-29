// Offline evidence analysis only: no browser launch, conversion or protected input access.
import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeRetainedSvgAllocation } from "./lib/svg-retained-allocation-analysis.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), terminalPath = "evidence/2026-10-29-svg-blur-boundary-browser-terminal.json";
const terminal = JSON.parse(await readFile(path.join(root, terminalPath)));
assert.match(terminal.browserReceipt.path, /^evidence\/[\w-]+-source-svg-browser\.json$/);
const browserPath = path.join(root, terminal.browserReceipt.path); assert.ok((await stat(browserPath)).size <= 4194304);
const bytes = await readFile(browserPath); assert.equal(bytes.length, terminal.browserReceipt.bytes); assert.equal(sha(bytes), terminal.browserReceipt.sha256);
const browser = JSON.parse(bytes); assert.equal(browser.executedHead, terminal.sourceHead);
const analysis = analyzeRetainedSvgAllocation(browser);
const report = { schemaVersion: 1, analyzedAt: new Date().toISOString(), sourceHead: terminal.sourceHead,
  scope: "Offline role and growth attribution from retained exact median/peak birth-identified samples, not a new conversion or acceptance run",
  sourceReceipt: terminal.browserReceipt, analysis,
  browserLaunched: false, conversionPerformed: false, protectedOriginalAccessed: false,
  publicEngineReplacement: false, oldReceiptEdited: false, wholeGoalComplete: false };
report.sourcePins = {};
for (const file of [terminalPath, "scripts/analyze-svg-blur-boundary-allocation.mjs", "scripts/lib/svg-retained-allocation-analysis.mjs", "scripts/lib/chromium-attribution.mjs"])
  report.sourcePins[file] = sha(await readFile(path.join(root, file)));
const output = "evidence/2026-10-29-svg-blur-boundary-allocation-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, incrementalPrivateMiB: analysis.incrementalPrivateMiB, passed: analysis.passed,
  dominantGrowth: analysis.processes.slice(0, 3).map(({ pid, type, measuredGrowthMiB }) => ({ pid, type, measuredGrowthMiB })),
  browserLaunched: false, conversionPerformed: false }));
