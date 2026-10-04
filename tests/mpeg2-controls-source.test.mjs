import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("private MPEG2 control adapter aliases only production MPEG4 code 3, preserving scalar options", async () => {
  const code = await readFile(new URL("../lib/media-conversion-options.ts", import.meta.url), "utf8");
  const stage = await readFile(new URL("../scripts/stage-mpeg2-controls-candidate.mjs", import.meta.url), "utf8");
  assert.match(code, /codec === "mpeg4"\s*\? 3/);
  assert.match(stage, /mapped\[0\] === 6 && mapped\[7\] === 3\) mapped\[7\] = 0/);
  assert.match(stage, /mapped = \[6, \.\.\.mapped.slice\(1, 4\), 0, 0, 0, \.\.\.mapped.slice\(4\)\]/);
  assert.doesNotMatch(stage, /mapped\[7\] === 1/);
  assert.match(stage, /PRIVATE_MPEG2_CONTROLS_ADAPTER_NOT_PUBLIC_SUPPORT/);
  const browser = await readFile(new URL("../tests/browser/mpeg2-controls-candidate.spec.ts", import.meta.url), "utf8");
  assert.match(browser, /toBe\(30\)/);
  assert.match(browser, /index \/ 15/);
  assert.match(browser, /accumulator \+= 15/);
  assert.match(browser, /toBeGreaterThanOrEqual\(0.98\)/);
  assert.match(browser, /scale=320:180:flags=bilinear/);
});
