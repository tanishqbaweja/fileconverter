import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = async file => (await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n").trimEnd();
const replace = (source, from, to, count = 1) => {
  assert.equal(source.split(from).length, count + 1, from); return source.replaceAll(from, to);
};
test("Free-header stager preserves actual native cores and every existing adapter option", async () => {
  let source = await read("stage-mpeg2-split-free-headers.mjs");
  const additions = [
    'assert.equal(manifest.artifacts["within-mpeg2-split.wasm"], "7b8a42b60efc439f0ceca045f4caaabfd4b0ebf0706397b6011cceedada4980c", "Static allocator layout applies to this actual core ONLY");\n',
    '  ["split-free-header-probe.mjs", path.join(root, "scripts/lib/split-free-header-probe.mjs")],\n  ["dlmalloc-free-header-inspection.mjs", path.join(root, "scripts/lib/dlmalloc-free-header-inspection.mjs")],\n',
  ];
  for (const addition of additions) source = replace(source, addition, "");
  source = replace(source, "PRIVATE_MPEG2_SPLIT_FREE_HEADERS_NOT_PUBLIC_SUPPORT", "PRIVATE_MPEG2_SPLIT_OOM_DIAGNOSTIC_NOT_PUBLIC_SUPPORT");
  source = replace(source, 'import {createSplitFreeHeaderProbe} from "/engines/remux/split-free-header-probe.mjs";',
    'import {createSplitAbortProbe} from "/engines/remux/split-abort-probe.mjs";');
  source = replace(source, "createSplitFreeHeaderProbe({heap: () => core?.HEAPU8 ?? null, memoryBytes:", "createSplitAbortProbe({memoryBytes:");
  source = replace(source, "stage-mpeg2-split-free-headers.mjs", "stage-mpeg2-split-oom-diagnostic.mjs");
  assert.equal(source, await read("stage-mpeg2-split-oom-diagnostic.mjs"));
});
test("Free-header driver preserves original, quality, memory, privacy, cleanup, no-retry gates", async () => {
  let source = await read("mpeg2-split-free-headers-diagnostic.mjs");
  source = replace(source, ' "scripts/lib/split-free-header-probe.mjs",\n  "scripts/lib/dlmalloc-free-header-inspection.mjs",', "");
  source = replace(source, "const freeHeaderSamples = [];\n", "");
  source = replace(source, `    if (raw.startsWith("WITHIN_MPEG2_FREE_HEADERS ") && freeHeaderSamples.length < 2) {
      try { freeHeaderSamples.push(JSON.parse(raw.slice("WITHIN_MPEG2_FREE_HEADERS ".length))); }
      catch { /* unavailable, never fabricate free space */ }
    }
`, "");
  source = replace(source, "mpeg2-split-free-headers-diagnostic.mjs", "mpeg2-split-oom-stack-diagnostic.mjs");
  source = replace(source, "stage-mpeg2-split-free-headers.mjs", "stage-mpeg2-split-oom-diagnostic.mjs", 3);
  source = replace(source, "-private-mpeg2-split-free-headers-diagnostic-native-100ms", "-private-mpeg2-split-oom-stack-diagnostic-native-100ms");
  source = replace(source, "mpeg2-split-free-headers-runtime-", "mpeg2-split-oom-runtime-");
  source = replace(source, "oomStackSamples, freeHeaderSamples,", "oomStackSamples,");
  source = replace(source, "Original-source failure-only allocator-header inspection, unchanged actual native cores/options/heaps/production I/O. Diagnostic instrumentation prevents memory/speed/quality acceptance.",
    "Original-source failure-stack diagnostic with unchanged real split cores/options and production I/O. Diagnostic instrumentation prevents memory/speed/quality acceptance.");
  assert.equal(source, await read("mpeg2-split-oom-stack-diagnostic.mjs"));
});
