import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = async file => (await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n").trimEnd();
const patch = (source, from, to, count = 1) => {
  assert.equal(source.split(from).length, count + 1, from); return source.replaceAll(from, to);
};
test("Locals stager changes only existing abort hook to pause and adds one owned helper", async () => {
  let actual = await read("stage-mpeg2-split-oom-locals.mjs");
  actual = patch(actual, '  ["split-abort-pause.mjs", path.join(root, "scripts/lib/split-abort-pause.mjs")],\n', "");
  actual = patch(actual, "PRIVATE_MPEG2_SPLIT_OOM_LOCALS_NOT_PUBLIC_SUPPORT", "PRIVATE_MPEG2_SPLIT_OOM_DIAGNOSTIC_NOT_PUBLIC_SUPPORT");
  actual = patch(actual, "createSplitAbortPause", "createSplitAbortProbe", 2);
  actual = patch(actual, 'from "/engines/remux/split-abort-pause.mjs"', 'from "/engines/remux/split-abort-probe.mjs"');
  actual = patch(actual, "stage-mpeg2-split-oom-locals.mjs", "stage-mpeg2-split-oom-diagnostic.mjs");
  assert.equal(actual, await read("stage-mpeg2-split-oom-diagnostic.mjs"));
});
test("Locals driver leaves entire original source, validation, memory, privacy, timeout and cleanup gates unchanged", async () => {
  let actual = await read("mpeg2-split-oom-locals-diagnostic.mjs");
  const additions = [
    'import { connectDebuggerTransport } from "./lib/cdp-debugger-transport.mjs";\nimport { attachFailureLocalCapture } from "./lib/cdp-failure-local-capture.mjs";\n',
    'let debugTransport, localInspector, debuggerLocals = null;\n',
    ' "scripts/lib/split-abort-pause.mjs",\n  "scripts/lib/cdp-debugger-transport.mjs", "scripts/lib/cdp-failure-local-capture.mjs", "scripts/lib/cdp-bounded-local-scopes.mjs",',
    `  debugTransport = await connectDebuggerTransport(version.webSocketDebuggerUrl);
  const workerTarget = await waitFor(async () => {
    const {targetInfos} = await debugTransport.send("Target.getTargets");
    const matching = targetInfos.filter(target => target.type === "worker" &&
      target.url.startsWith(origin + "/assets/conversion.worker-"));
    assert.ok(matching.length <= 1, "Unique production conversion worker required");
    return matching[0] ?? null;
  }, "production conversion worker");
  localInspector = await attachFailureLocalCapture(debugTransport, workerTarget.targetId,
    new Set(["av_malloc", "av_buffer_allocz", "sbrk", "dlposix_memalign", "emscripten_builtin_malloc"]));
`,
    '  await attempt(async () => { if (localInspector) debuggerLocals = await localInspector.report(); });\n  await attempt(async () => { if (localInspector) await localInspector.close(); else debugTransport?.close(); });\n',
  ];
  for (const addition of additions) actual = patch(actual, addition, "");
  actual = patch(actual, "mpeg2-split-oom-locals-diagnostic.mjs", "mpeg2-split-oom-stack-diagnostic.mjs");
  actual = patch(actual, "stage-mpeg2-split-oom-locals.mjs", "stage-mpeg2-split-oom-diagnostic.mjs", 3);
  actual = patch(actual, "-private-mpeg2-split-oom-locals-diagnostic-native-100ms", "-private-mpeg2-split-oom-stack-diagnostic-native-100ms");
  actual = patch(actual, "mpeg2-split-oom-locals-runtime-", "mpeg2-split-oom-runtime-");
  actual = patch(actual, "oomStackSamples, debuggerLocals,", "oomStackSamples,");
  actual = patch(actual, "Original-source failure-point Wasm scalar locals via worker debugger; unchanged real split cores/options and production I/O. Debugger tier-down prevents memory/speed/quality acceptance.",
    "Original-source failure-stack diagnostic with unchanged real split cores/options and production I/O. Diagnostic instrumentation prevents memory/speed/quality acceptance.");
  assert.equal(actual, await read("mpeg2-split-oom-stack-diagnostic.mjs"));
});
