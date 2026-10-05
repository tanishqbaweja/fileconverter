import assert from "node:assert/strict";

// Private adapter check only. Native bounds are read after the real factory;
// never touch codec frames, source settings, heap size or output contents.
export function mpeg2StackReserveAdapter(manifest) {
  if (manifest.nativeStackBytes === undefined) return ""; // Historical core.
  assert.equal(manifest.nativeStackBytes, 262144);
  assert.equal(manifest.asyncifyStackBytes, 262144);
  assert.equal(manifest.stackOverflowCheck, 2);
  assert.equal(manifest.compiledStackOverflowHandler, true);
  return `  if (typeof core._emscripten_stack_get_base !== "function" ||
      typeof core._emscripten_stack_get_end !== "function")
    throw new Error("Guarded candidate native stack bounds unavailable");
  const nativeStackBytes = core._emscripten_stack_get_base() - core._emscripten_stack_get_end();
  if (nativeStackBytes !== 262144)
    throw new Error("Guarded candidate actual native stack reserve mismatch");
  console.debug("WITHIN_MPEG2_STACK_RESERVE " + JSON.stringify({ nativeStackBytes,
    asyncifyStackBytes: 262144, stackOverflowCheck: 2, scope: "reserved-not-high-water-not-acceptance" }));
`;
}
