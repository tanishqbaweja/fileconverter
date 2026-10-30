// Extend the immutable19-case owner; do not rewrite its historical source pins.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../images/resvg-source/source-pins.mjs";
export const svgPublicationCheckBaseSha256 = "1364823a4be8a2561348c3ac4c5a217c614417b6735dff5767823c77c75d9d73";
export function makeSvgPublicationCheckDriver({ root, sourceBytes }) {
  assert.equal(root, path.resolve(import.meta.dirname, "../..")); assert.equal(sha(sourceBytes), svgPublicationCheckBaseSha256);
  const edits = [
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['testMatch:["**/privacy-offline.spec.ts","**/static-host-policy.spec.ts"],', 'testMatch:["**/privacy-offline.spec.ts","**/static-host-policy.spec.ts","**/svg-publication-gate.spec.ts"],'],
    ['assert.equal(result.stats.expected, 19);', 'assert.equal(result.stats.expected, 21);'],
    ['let runtime, server, runner, serverBirth, runnerBirth, serverLog = "", runnerLog = "", result, directHost;',
      'for(const file of ["tests/browser/svg-publication-gate.spec.ts","scripts/lib/svg-publication-check-recipe.mjs","scripts/run-svg-publication-checks.mjs"])report.sourcePins[file]=sha(await readFile(path.join(root,file)));\nlet runtime, server, runner, serverBirth, runnerBirth, serverLog = "", runnerLog = "", result, directHost;'],
    ['  await writeFile(configFile, `import base from ',
      '  env.WITHIN_SVG_GATE_SCREENSHOT=path.join(root,"output/playwright",stamp+"-svg-publication-notice.png");\n  await writeFile(configFile, `import base from '],
    ['  assert.equal(result.stats.unexpected, 0); assert.equal(result.stats.skipped, 0); assert.equal(result.stats.flaky, 0);',
      '  assert.equal(result.stats.unexpected, 0); assert.equal(result.stats.skipped, 0); assert.equal(result.stats.flaky, 0);\n  const screenshot=await readFile(env.WITHIN_SVG_GATE_SCREENSHOT);assert.ok(screenshot.length>0&&screenshot.length<=1048576);\n  report.svgPublicationGate={conversionPerformedByGateTests:false,qualificationAccepted:false,screenshot:{path:path.relative(root,env.WITHIN_SVG_GATE_SCREENSHOT),bytes:screenshot.length,sha256:sha(screenshot)}};'],
    ['Complete unchanged production privacy/offline/static-host browser specs; not process-memory, stress, OS-picker or native reproduction acceptance',
      'All19 unchanged production privacy/offline/static-host cases plus2 SVG publication gates; no SVG conversion or memory/stress/native promotion acceptance'],
  ];
  let source = sourceBytes.toString();
  for (const [before, after] of edits) { assert.equal(source.split(before).length - 1, 1); source = source.replace(before, after); }
  let reversed = source;
  for (const [before, after] of [...edits].reverse()) { assert.equal(reversed.split(after).length - 1, 1); reversed = reversed.replace(after, before); }
  assert.equal(reversed, sourceBytes.toString());
  source = source.replace(/((?:from\s+|import\s*)["'])(\.\.?\/[^"']+)(["'])/g, (_all, start, relative, end) =>
    start + pathToFileURL(path.resolve(root, "scripts", relative)).href + end);
  return { source, proof: { baseSha256: svgPublicationCheckBaseSha256, generatedSha256: sha(source),
    exactSemanticEditsReversible: true, original19TestsRetained: true, addedPublicGateTests: 2,
    originalWrapperEdited: false, browserHeadless: true, conversionMemoryAcceptance: false } };
}
