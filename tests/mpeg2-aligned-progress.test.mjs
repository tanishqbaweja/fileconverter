import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeAlignedProgressDriver } from "../scripts/lib/mpeg2-aligned-progress-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("Progress derivative is one bounded changed candidate attempt, never full-source acceptance", async () => {
  const original = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
  const generated = makeAlignedProgressDriver(original, root, specifier => import.meta.resolve(specifier));
  assert.ok(generated.includes("const diagnosticOnly = true"));
  assert.ok(generated.includes("const deadline = Date.now() + 2 * 60_000"));
  assert.ok(generated.includes('if (diagnosticOnly && number > 1) break'));
  assert.ok(generated.includes('assert.equal(diagnosticOnly, false'));
  assert.ok(generated.includes('publicAcceptance: false'));
  for (const needle of ['run.incrementalPrivateMiB <= 250', 'await verifySource()',
    '32GiB repository-local disk preflight required', 'actualWasmMemoryLimits',
    'ssim >= 0.98', 'maximumTimestampErrorSeconds <= 0.001',
    'cancelBrowserConversionBeforeCleanup(page)', 'runtime.close()',
    'scripts/stage-mpeg2-split-direct.mjs', '48 * MiB', '16 * MiB', '32 * MiB'])
    assert.ok(generated.includes(needle), needle);
  assert.doesNotMatch(generated, /from "\.\//);
  assert.throws(() => makeAlignedProgressDriver(original + "\n", root, () => ""), /Frozen full-source/);
});
test("Progress entrypoint requires built alignment candidate and owns disposable generated driver", async () => {
  const source = await readFile(path.join(root, "scripts/mpeg2-aligned-progress.mjs"), "utf8");
  for (const needle of ['manifest.scope', 'actualLinkedWrapperVerified, true',
    'browserConversionVerified, false', 'createOwnedRuntimeScratch(', 'flag: "wx"',
    '} finally {', 'await runtime.close()']) assert.ok(source.includes(needle), needle);
  assert.doesNotMatch(source, /ffmpeg|test\.mkv/);
});

test("Static audit proves actual calls, never executes a derivative or reads the protected source", async () => {
  const source = await readFile(path.join(root, "scripts/audit-mpeg2-aligned-link.mjs"), "utf8");
  for (const needle of ['functions.av_malloc.calls.includes("__wrap_posix_memalign")',
    'upstreamFallbackVerified: false, linkedPathVerified: false',
    'functions.__wrap_posix_memalign.calls.includes("emscripten_builtin_malloc")',
    'createStaticFunctionSlice(binary', 'wasmFunctionsExecuted: 0', 'publicAcceptance: false',
    'await runtime.close()', 'npm_config_cache: path.join(runtime.directory']) assert.ok(source.includes(needle), needle);
  assert.doesNotMatch(source, /WebAssembly\.instantiate|new WebAssembly\.Instance|test\.mkv/);
});

test("Candidate downloader requires terminal success/head/artifact/source hashes and never overwrites an old tool slot", async () => {
  const source = await readFile(path.join(root, "scripts/download-mpeg2-aligned-candidate.mjs"), "utf8");
  for (const needle of ['assert.equal(run.headSha, expectedHead)', 'assert.equal(run.status, "completed")',
    'assert.equal(run.conclusion, "success")', 'Never overwrite an old candidate',
    'assert.equal(current.ino, identity.ino)', 'assert.equal(path.dirname(output), work)',
    'Object.entries(manifest.artifacts)', 'Object.entries(manifest.sources)',
    'originalRead: false', 'conversionsPerformed: 0', 'publicAcceptance: false',
    'if (runtime) await runtime.close()']) assert.ok(source.includes(needle), needle);
  assert.doesNotMatch(source, /ffmpeg\.exe|test\.mkv|git checkout|reset --hard/);
});
