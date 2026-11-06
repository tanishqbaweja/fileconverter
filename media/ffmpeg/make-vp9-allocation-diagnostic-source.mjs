// Exact owned build sources and installed pinned SDK headers, before libvpx build.
import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { makeVp9EncoderAllocationDiagnostic, makeVp9FrameAllocationDiagnostic, VP9_ALLOCATION_DIAGNOSTIC_PINS } from "./vp9-allocation-diagnostic-recipe.mjs";
import { runVp9AllocationCUnit } from "./vp9-allocation-c-unit.mjs";
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/vp9-duration-build");
assert.equal(process.argv.length, 2); assert.equal(await realpath(build), build);
const sdk = path.join(root, "work/vp9-duration-emsdk/upstream/emscripten/system/include/emscripten");
for (const [name, pin] of [["heap.h", VP9_ALLOCATION_DIAGNOSTIC_PINS.heapHeader], ["emmalloc.h", VP9_ALLOCATION_DIAGNOSTIC_PINS.allocatorHeader]]) {
  const file = path.join(sdk, name); assert.equal(await realpath(file), file);
  assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), pin, "Actual installed pinned SDK header");
}
const encoderFile = path.join(build, "libvpx/vp9/encoder/vp9_encoder.c"), allocatorFile = path.join(build, "libvpx/vpx_scale/generic/yv12config.c");
for (const file of [encoderFile, allocatorFile]) assert.equal(await realpath(file), file);
const encoder = makeVp9EncoderAllocationDiagnostic(await readFile(encoderFile, "utf8")),
  frameBase = await readFile(allocatorFile, "utf8"), allocator = makeVp9FrameAllocationDiagnostic(frameBase);
const cUnit = await runVp9AllocationCUnit(frameBase);
for (const [name, content] of [["vp9_encoder.allocation.diagnostic.c", encoder.generated], ["yv12config.allocation.base.c", frameBase],
  ["yv12config.allocation.diagnostic.c", allocator.generated]]) await writeFile(path.join(build, name), content, { flag: "wx" });
const compact = ({ generated: _generated, ...proof }) => { void _generated; return proof; };
await writeFile(path.join(build, "vp9-allocation-diagnostic-proof.json"), JSON.stringify({ encoder: compact(encoder), allocator: compact(allocator),
  cUnit,
  installedSdkHeaderPins: { heap: VP9_ALLOCATION_DIAGNOSTIC_PINS.heapHeader, allocator: VP9_ALLOCATION_DIAGNOSTIC_PINS.allocatorHeader },
  sampleTiming: "Failure only, after null return and before stderr formatting", frameRequestIsNotUnderlyingMallocRequest: true,
  actualBrowserMeasurements: null, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
await writeFile(encoderFile, encoder.generated); await writeFile(allocatorFile, allocator.generated);
assert.equal(await readFile(encoderFile, "utf8"), encoder.generated); assert.equal(await readFile(allocatorFile, "utf8"), allocator.generated);
console.log(JSON.stringify({ diagnosticOnly: true, encoderSha256: encoder.generatedSha256, allocatorSha256: allocator.generatedSha256, publicAcceptance: false }));
