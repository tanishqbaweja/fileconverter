import assert from "node:assert/strict";
import { sha } from "./source-pins.mjs";
export const originalResvgBindingSha256 = "10170d02d816f02ec76f9bc095b01d9becf536e7b1e12e5aa616652c84b237a1";
export const observedBindingHeader = `// SPDX-License-Identifier: MPL-2.0\n// @resvg/resvg-wasm 2.6.2 binding, unchanged except appended read-only getters.\n// Original SHA-256: ${originalResvgBindingSha256}\n// Source: https://github.com/thx/resvg-js/tree/9ca058462ac529120c8cc84ddcd6fef644cc5406\n// License: resvg-LICENSE-MPL-2.0.txt in this directory.\n/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-array-constructor -- pinned upstream generated binding */\n`;
export const observedBindingGetter = `\n// Return the existing exported memory only; do not instantiate, grow, copy, or retain it.\nexport function getInitializedResvgMemory() {\n  return wasm?.memory instanceof WebAssembly.Memory ? wasm.memory : null;\n}\n`;
export const observedProbeGetter = `\n// Optional diagnostic exports: absent/unvisited is unavailable, never fabricated zero.\nexport function getLastResvgFailureProbe() {\n  const site = wasm?.__within_svg_probe_site, value = wasm?.__within_svg_probe_value;\n  if (!(site instanceof WebAssembly.Global) || !(value instanceof WebAssembly.Global)) return null;\n  if (typeof site.value !== "number" || typeof value.value !== "number" || site.value < 1 || site.value > 5) return null;\n  return { site: site.value >>> 0, value: value.value >>> 0 };\n}\n`;
export function makeObservedResvgBinding(original) {
  assert.equal(sha(original), originalResvgBindingSha256, "Exact upstream binding before the additive getter");
  return observedBindingHeader + original.toString() + observedBindingGetter + observedProbeGetter;
}
