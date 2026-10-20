// Original complete audit, with new report bindings plus independent-session checks.
import "./lib/reliable-readonly-preflight.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/analyze-jspi-three-full.mjs"), "utf8");
const recipe = exactPatch(source, [
  ['const root = path.resolve(import.meta.dirname, ".."), read =', `const root = ${JSON.stringify(root)}, read =`],
  ["evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json", "evidence/2026-10-19T18-08-46-161Z-jspi-ssim-full-terminal.json"],
  ["outputs/reports/2026-10-18T23-56-42-355Z-private-mpeg2-updated-chrome-full-native-100ms", "outputs/reports/2026-10-19T18-09-43-926Z-private-mpeg2-updated-chrome-full-native-100ms"],
  ["evidence/2026-10-18T23-54-47-907Z-jspi-ssim-full-supervisor-full.json", "evidence/2026-10-19T18-08-25-765Z-jspi-ssim-full-supervisor-full.json"],
  ["evidence/2026-10-19-jspi-three-full-independent-analysis.json", "evidence/2026-10-20-jspi-cold-repeat-independent-analysis.json"],
  ['import { inspectThreeFullJspiRuns } from "./lib/jspi-three-full-observation.mjs";',
    'import { inspectColdFullJspiRuns as inspectThreeFullJspiRuns } from "./lib/jspi-cold-full-observation.mjs";\nimport { inspectJspiColdRepeat } from "./lib/jspi-cold-repeat-observation.mjs";'],
  ['const ownSources = {};',
    'const previousTerminalPath="evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json",previousTerminalBytes=await read(previousTerminalPath),previousTerminal=JSON.parse(previousTerminalBytes);\nconst previousReport=JSON.parse(await unpack(previousTerminal.report));\nconst coldRepeat=inspectJspiColdRepeat(previousTerminal,previousReport,terminal,report);\nconst ownSources = {};'],
  ['["scripts/analyze-jspi-three-full.mjs", "scripts/lib/jspi-three-full-observation.mjs", "tests/jspi-three-full-observation.test.mjs"]',
    '["scripts/analyze-jspi-three-full.mjs", "scripts/lib/jspi-three-full-observation.mjs", "tests/jspi-three-full-observation.test.mjs", "scripts/analyze-jspi-cold-repeat.mjs", "scripts/lib/jspi-cold-repeat-observation.mjs", "tests/jspi-cold-repeat-observation.test.mjs", "scripts/lib/jspi-cold-full-observation.mjs", "scripts/lib/jspi-cold-sample-availability.mjs", "tests/jspi-cold-sample-availability.test.mjs"]'],
  ['analysis, ownSources,', 'analysis,coldRepeat,previousTerminal:{path:previousTerminalPath,sha256:sha(previousTerminalBytes)}, ownSources,'],
  ['"Three same-session full outputs passed. Investigate bounded retained cleanup drift and repeat cold session/scaling before public promotion; perform paired performance comparison before any speed or fastest claim. Entire goal remains incomplete."',
    '"Two independent clean browser sessions, each three identical full originals, verified. Do not repeat the unchanged full/cold gate. Next repair clean-checkout CI, then close new-route scaling, accurate production integration and all remaining release blockers. Retained cleanup drift remains explicit; no zero-growth/general speed/public/project acceptance claim."'],
  ['output, ...analysis, originalSha256', 'output,coldRepeat, ...analysis, originalSha256'],
]);
const generated = recipe.generated.replace(/from "(\.[^"\r\n]+)"/g,
  (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`);
try { await import("data:text/javascript;base64," + Buffer.from(generated).toString("base64")); }
catch (error) { console.error(JSON.stringify({ name: error.name, message: String(error.message).slice(0, 2048), code: error.code ?? null })); process.exitCode = 1; }
