import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n").trimEnd();
const replace = (source, patches) => {
  for (const [from, to] of patches) { assert.equal(source.split(from).length, 2, from); source = source.replace(from, to); }
  return source;
};
test("OOM stager changes only failure callback instrumentation and its own owned helper asset", async () => {
  const patches = [
  [
    "// Private generated-asset substitution only. Published assets never change.",
    "// Private failure-stack diagnostic. Actual Wasm, source pins, options and published assets unchanged."
  ],
  [
    "PRIVATE_MPEG2_SPLIT_PRODUCTION_ADAPTER_NOT_PUBLIC_SUPPORT",
    "PRIVATE_MPEG2_SPLIT_OOM_DIAGNOSTIC_NOT_PUBLIC_SUPPORT"
  ],
  [
    "import {createMpeg2SplitSession} from \"/engines/remux/mpeg2-split-session.mjs\";",
    "import {createMpeg2SplitSession} from \"/engines/remux/mpeg2-split-session.mjs\";\nimport {createSplitAbortProbe} from \"/engines/remux/split-abort-probe.mjs\";"
  ],
  [
    "core = await decoderFactory({...options, withinBridge, withinSplit: session,",
    "core = await decoderFactory({...options, withinBridge, withinSplit: session,\n      onAbort: createSplitAbortProbe({memoryBytes: () => core?.HEAPU8.byteLength ?? null, onAbort: options.onAbort}),"
  ],
  [
    "const additional = new Map([",
    "const additional = new Map([\n  [\"split-abort-probe.mjs\", path.join(root, \"scripts/lib/split-abort-probe.mjs\")],"
  ],
  [
    "Usage: stage-mpeg2-split-direct.mjs stage|restore",
    "Usage: stage-mpeg2-split-oom-diagnostic.mjs stage|restore"
  ]
];
  const expected = replace(await read("scripts/stage-mpeg2-split-direct.mjs"), patches);
  assert.equal(await read("scripts/stage-mpeg2-split-oom-diagnostic.mjs"), expected);
});
test("OOM original driver remains fail-fast, one bounded diagnostic, unchanged source/quality/private-memory requirements", async () => {
  const patches = [
  [
    "// Full protected source, ONE page navigation; normal production worker recycling between repeats.",
    "// Full protected source, ONE failure-only diagnostic with normal production I/O. NOT acceptance."
  ],
  [
    "const diagnosticOnly = false; // Uninstrumented real split conversion, all three stress runs required.",
    "const diagnosticOnly = true; // ONE changed failure-stack diagnostic; never acceptance."
  ],
  [
    "\"scripts/mpeg2-split-single-navigation-memory.mjs\",",
    "\"scripts/mpeg2-split-oom-stack-diagnostic.mjs\", \"scripts/lib/split-abort-probe.mjs\","
  ],
  [
    "-private-mpeg2-split-single-navigation-native-100ms",
    "-private-mpeg2-split-oom-stack-diagnostic-native-100ms"
  ],
  [
    "createOwnedRuntimeScratch(\"mpeg2-split-single-nav-runtime-\")",
    "createOwnedRuntimeScratch(\"mpeg2-split-oom-runtime-\")"
  ],
  [
    "const splitFinalSamples = [];",
    "const splitFinalSamples = [];\nconst oomStackSamples = [];"
  ],
  [
    "    const text = message.text().slice(0, 2048);",
    "    const raw = message.text().slice(0, 12288);\n    if (raw.startsWith(\"WITHIN_MPEG2_OOM_STACK \") && oomStackSamples.length < 2) {\n      try {\n        const sample = JSON.parse(raw.slice(\"WITHIN_MPEG2_OOM_STACK \".length));\n        assert.ok(sample.stack.length <= 8192 && sample.what.length <= 512);\n        oomStackSamples.push(sample);\n      } catch { /* malformed diagnostic is unavailable, never invented */ }\n    }\n    const text = raw.slice(0, 2048);"
  ],
  [
    "const deadline = Date.now() + 6 * 60 * 60_000;",
    "const deadline = Date.now() + 2 * 60_000;"
  ],
  [
    "    allocatorSamples, allocatorSamplesEvicted, splitFinalSamples, nativeStackSamples,",
    "    allocatorSamples, allocatorSamplesEvicted, splitFinalSamples, nativeStackSamples, oomStackSamples,"
  ],
  [
    "Full protected source HEVC to separate MPEG2 encoder via production selected OPFS handle, single page navigation with normal worker replacement; no native OS-picker or speed-A/B certification",
    "Original-source failure-stack diagnostic with unchanged real split cores/options and production I/O. Diagnostic instrumentation prevents memory/speed/quality acceptance."
  ]
];
  let expected = replace(await read("scripts/mpeg2-split-single-navigation-memory.mjs"), patches);
  assert.equal(expected.split("scripts/stage-mpeg2-split-direct.mjs").length, 4);
  expected = expected.replaceAll("scripts/stage-mpeg2-split-direct.mjs", "scripts/stage-mpeg2-split-oom-diagnostic.mjs");
  const actual = await read("scripts/mpeg2-split-oom-stack-diagnostic.mjs");
  assert.equal(actual, expected);
  assert.ok(actual.includes("run.incrementalPrivateMiB <= 250"));
  assert.ok(actual.includes("assert.equal(diagnosticOnly, false"));
  assert.ok(actual.includes("if (diagnosticOnly && number > 1) break"));
  assert.ok(actual.includes("cancelBrowserConversionBeforeCleanup(page)"));
});
