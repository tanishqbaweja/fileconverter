// Bounded, explicitly non-acceptance derivative of the executed full-source
// driver. Never changes its heap/quality/I/O/memory/validation/cleanup gates.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
export const ORIGINAL_DRIVER_SHA256 = "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417";
export function makeAlignedProgressDriver(source, root, resolvePackage) {
  assert.equal(createHash("sha256").update(source).digest("hex"), ORIGINAL_DRIVER_SHA256, "Frozen full-source driver changed");
  assert.equal(path.resolve(root), root);
  const patches = [
    ['const diagnosticOnly = false; // Uninstrumented real split conversion, all three stress runs required.',
      'const diagnosticOnly = true; // ONE changed alignment candidate progress probe; never acceptance.'],
    ['const root = path.resolve(import.meta.dirname, ".."), MiB = 1024 ** 2;',
      `const root = ${JSON.stringify(root)}, MiB = 1024 ** 2;`],
    ['const deadline = Date.now() + 6 * 60 * 60_000;', 'const deadline = Date.now() + 2 * 60_000;'],
    ['const sourceFiles = ["scripts/mpeg2-split-single-navigation-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-aligned-progress.mjs", "scripts/lib/mpeg2-aligned-progress-recipe.mjs", "scripts/mpeg2-split-single-navigation-memory.mjs",'],
    ['-private-mpeg2-split-single-navigation-native-100ms', '-private-mpeg2-aligned-progress-native-100ms'],
    ['"mpeg2-split-single-nav-runtime-"', '"mpeg2-aligned-progress-runtime-"'],
    ['Full protected source HEVC to separate MPEG2 encoder via production selected OPFS handle, single page navigation with normal worker replacement; no native OS-picker or speed-A/B certification',
      'ONE changed alignment candidate, full protected source and unchanged production quality/heaps/I/O, bounded two-minute progress probe. Incomplete output and memory are NOT acceptance or speed/fidelity certification.'],
  ];
  let generated = source;
  for (const [before, after] of patches) {
    assert.equal(generated.split(before).length, 2, before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of patches) {
    assert.equal(reversed.split(after).length, 2, after);
    reversed = reversed.replace(after, before);
  }
  assert.equal(reversed, source);
  // Executable scratch stays in work. Resolve the original driver's imports
  // to the same modules explicitly rather than creating source files elsewhere.
  return generated.replace(/from "([^"\n]+)"/g, (all, specifier) => {
    if (specifier.startsWith("node:")) return all;
    const url = specifier.startsWith("./")
      ? pathToFileURL(path.resolve(root, "scripts", specifier)).href : resolvePackage(specifier);
    assert.ok(url.startsWith("file:"), "Only repository modules/installed packages");
    return `from ${JSON.stringify(url)}`;
  });
}
