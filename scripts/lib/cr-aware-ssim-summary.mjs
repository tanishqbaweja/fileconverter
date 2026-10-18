// Independent log framing only. Preserve every original score/count/cap guard.
import { readFile } from "node:fs/promises";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function deriveCrAwareSsimSummary(source) {
  return exactPatch(source, [[
    '    const newline = stderr.indexOf("\\n", position), end = newline < 0 ? stderr.length : newline;',
    '    let end = position;\n    while(end < stderr.length && stderr.charCodeAt(end) !== 10 && stderr.charCodeAt(end) !== 13) end++;',
  ]]);
}
export const crAwareSsimDerivation = deriveCrAwareSsimSummary(await readFile(new URL("./bounded-ssim-summary.mjs", import.meta.url), "utf8"));
const parserModule = await import("data:text/javascript;base64," + Buffer.from(crAwareSsimDerivation.generated).toString("base64"));
export const inspectSsimSummary = parserModule.inspectSsimSummary;
export const requireNumericSsim = parserModule.requireNumericSsim;
export const SSIM_DIAGNOSTIC_LIMITS = parserModule.SSIM_DIAGNOSTIC_LIMITS;
