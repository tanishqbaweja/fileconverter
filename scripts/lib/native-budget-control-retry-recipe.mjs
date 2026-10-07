// First preflight failure and its source pins remain immutable; retry only after
// a read-only host check passes. Same allocation,250MiB/caps/flags/finally.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
export function makeBudgetControlRetry(source, root, resolvePackage) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "587e8369ccb7feec9fd6d1c8cec43a4a1620eacf3a887e88ace4e07b6ffb5b89");
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), MiB = 1048576;',
      `const root = ${JSON.stringify(root)}, exec = promisify(execFile), MiB = 1048576;`],
    ['const files = ["scripts/probe-native-budget-failure.mjs",',
      'const files = ["scripts/retry-native-budget-failure.mjs", "scripts/lib/native-budget-control-retry-recipe.mjs", "scripts/lib/host-memory-preflight.mjs", "scripts/probe-native-budget-failure.mjs",'],
    ['evidence/native-budget-failure-control-2026-10-07.json', 'evidence/native-budget-failure-control-retry-2026-10-07.json'],
  ];
  let generated = source;
  for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only explicit root/provenance/report path changes, no weakened safety or trigger");
  return generated.replace(/from "([^"\n]+)"/g, (all, specifier) => {
    if (specifier.startsWith("node:")) return all;
    const url = specifier.startsWith("./") ? pathToFileURL(path.resolve(root, "scripts", specifier)).href : resolvePackage(specifier);
    assert.ok(url.startsWith("file:")); return `from ${JSON.stringify(url)}`;
  });
}
