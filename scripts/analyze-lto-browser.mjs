// Reuse every independent source/content/lifecycle/cleanup audit from JSPI.
import "./lib/reliable-readonly-preflight.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
const parent = await readFile(path.join(root, "scripts/analyze-jspi-browser.mjs"), "utf8");
const recipe = exactPatch(parent, [
  ['const root = path.resolve(import.meta.dirname, ".."), read =', `const root = ${JSON.stringify(root)}, read =`],
  ["evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json", "evidence/2026-10-19T16-57-21-316Z-lto-control-terminal.json"],
  ["evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json", "evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"],
  ["assert.equal(Object.keys(source.pins).length, 832);", "assert.equal(Object.keys(source.pins).length, 853);"],
  ["all832ExecutedCurrentPostPinsEqual", "all853ExecutedCurrentPostPinsEqual"],
  ['import { deriveJspiBrowserDriver, deriveJspiBrowserCaller } from "./lib/jspi-browser-control.mjs";',
    'import { deriveLtoBrowserDriver as deriveJspiBrowserDriver, deriveLtoBrowserCaller as deriveJspiBrowserCaller } from "./lib/lto-browser-control.mjs";'],
  ['import { deriveJspiBrowserStager } from "./lib/jspi-browser-adapter.mjs";',
    'import { deriveLtoBrowserStager as deriveJspiBrowserStager } from "./lib/lto-browser-adapter.mjs";'],
  ['import { makeJspiBrowserComposition } from "./lib/jspi-browser-native.mjs";',
    'import { makeLtoBrowserComposition as makeJspiBrowserComposition } from "./lib/lto-browser-native.mjs";'],
  ['import { inspectJspiBrowserResult } from "./lib/jspi-browser-observation.mjs";',
    'import { inspectLtoBrowserResult as inspectJspiBrowserResult } from "./lib/lto-browser-observation.mjs";'],
  ['["scripts/analyze-jspi-browser.mjs", "scripts/lib/jspi-browser-observation.mjs", "tests/jspi-browser-observation.test.mjs"]',
    '["scripts/analyze-jspi-browser.mjs", "scripts/lib/jspi-browser-observation.mjs", "tests/jspi-browser-observation.test.mjs", "scripts/analyze-lto-browser.mjs", "scripts/lib/lto-browser-observation.mjs", "tests/lto-browser-observation.test.mjs"]'],
  ["evidence/2026-10-18-jspi-browser-independent-analysis.json", "evidence/2026-10-19-lto-browser-independent-analysis.json"],
  ['"Private small qualification passed. Bind this exact candidate/source/validator/assets into full protected-original three-run qualification, preserving all original timing/content/stability/memory/cleanup gates; no public promotion or 10GB scaling claim before those pass."',
    '"Private LTO small qualification passed. Next identical-input balanced A/B under the same production settings and unchanged memory/content/recovery gates. Historical elapsed times are unpaired and cannot prove a speedup. Full-original/cold/scaling/public gates remain pending; do not rerun unchanged multi-hour baseline."'],
]);
const generated = recipe.generated.replace(/from "(\.[^"\r\n]+)"/g,
  (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`)
  .replace('from "esbuild"', `from ${JSON.stringify(import.meta.resolve("esbuild"))}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`);
try { await import("data:text/javascript;base64," + Buffer.from(generated).toString("base64")); }
catch (error) { console.error(JSON.stringify({ name: error.name, message: String(error.message).slice(0, 2048), code: error.code ?? null })); process.exitCode = 1; }
