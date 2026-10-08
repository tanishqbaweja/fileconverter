// Preserve the executed launcher; honor the user's no-visible-window request.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const STABLE_UI_GOLDEN_EXECUTED_LAUNCHER_SHA256 = "2b6201c7e9ab33ffe18e13578421ae9b02604eb227936d68c3655d01e874ac19";
export function makeHeadlessStableUiLauncher(source, root) {
  assert.equal(createHash("sha256").update(source).digest("hex"), STABLE_UI_GOLDEN_EXECUTED_LAUNCHER_SHA256);
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
    ['["scripts/validate-stable-progress-ui-goldens.mjs", "scripts/build-stable-progress-ui-candidate.mjs",',
      '["scripts/validate-stable-progress-ui-headless.mjs", "scripts/lib/headless-stable-ui-golden-recipe.mjs", "tests/headless-stable-ui-goldens.test.mjs", "scripts/validate-stable-progress-ui-goldens.mjs", "scripts/build-stable-progress-ui-candidate.mjs",'],
    ['"stable-progress-ui-goldens-"', '"stable-ui-headless-goldens-"'],
    ['root, stamp + "-matrix-goldens", sourcePins["tests/browser/mpeg2-split-direct-candidate.spec.ts"]);',
      'root, stamp + "-matrix-goldens", sourcePins["tests/browser/mpeg2-split-direct-candidate.spec.ts"]);\n  assert.equal(spec.split("headless: false").length, 2);\n  spec = spec.replace("headless: false", "headless: true");'],
    ['assert.equal((await inspectStressHostMemory()).safeToStart, true);',
      'launchHost = await inspectStressHostMemory(); console.log(JSON.stringify({ launchHost }));\n  assert.equal(launchHost.safeToStart, true);'],
    ['let failure = null, build, spec, driver, config, protectedPost, restoredProductionBuild = false;',
      'let failure = null, build, spec, driver, config, protectedPost, launchHost, restoredProductionBuild = false;'],
    ['failure, hostPreflight: host, diskPreflightBytes:', 'failure, hostPreflight: host, launchHostPreflight: launchHost ?? null, browserMode: "headless", subprocessWindowsHidden: true, diskPreflightBytes:'],
    ['"headed-suite-returned-success-independent-freeze-pending"', '"headless-suite-returned-success-independent-freeze-pending"'],
    ['-stable-progress-ui-goldens.json', '-stable-progress-ui-headless-goldens.json'],
  ];
  let result = source;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only headless mode, explicit fresh host receipt and provenance/names; five real conversion/quality/privacy/recovery/source/finally gates retained");
  return result.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
    (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
}
