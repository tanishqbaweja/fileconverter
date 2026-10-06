// Inspect local scalar state only at one debugger pause. No evaluateOnCallFrame,
// getters, remote heap dumps or media buffers; unknown values remain unavailable.
export async function captureBoundedLocalScopes(send, paused, wasmScriptIds, functionNames = null) {
  if (!Array.isArray(paused.callFrames) || paused.callFrames.length > 128) throw new Error("Invalid pause frame inventory");
  if (!(wasmScriptIds instanceof Set) || wasmScriptIds.size > 16) throw new Error("Verified Wasm script inventory required");
  let operations = 0;
  const properties = async (objectId, depth = 0) => {
    if (++operations > 64) throw new Error("Paused local property operation cap");
    const response = await send("Runtime.getProperties", { objectId, ownProperties: true, generatePreview: false });
    if (response.exceptionDetails) throw new Error("Paused properties unavailable");
    if (!Array.isArray(response.result) || response.result.length > 128) throw new Error("Paused local property count cap");
    const entries = [];
    for (const property of response.result) {
      const value = property.value;
      if (property.name === "__proto__") continue;
      const entry = { name: property.name.slice(0, 256), type: value?.type ?? null,
        subtype: value?.subtype ?? null, description: value?.description?.slice(0, 256) ?? null,
        value: ["number", "boolean"].includes(value?.type) ? value.value ?? null : null,
        accessorUnavailable: Boolean(property.get || property.set) };
      // Only Chrome's scalar Wasm wrappers. Never traverse a JS HEAP, typed
      // array, Module, File, getter, pointer target, or expression-stack object.
      if (value?.subtype === "wasmvalue" && value.objectId && depth < 1)
        entry.children = await properties(value.objectId, depth + 1);
      entries.push(entry);
    }
    return entries;
  };
  const frames = [];
  for (const frame of paused.callFrames.slice(0, 32)) {
    if (!wasmScriptIds.has(frame.location?.scriptId)) continue;
    if (functionNames && !functionNames.has(frame.functionName.replace(/^\$/, ""))) continue;
    const scopes = [];
    for (const scope of frame.scopeChain.filter(scope => scope.type === "local").slice(0, 4)) {
      if (scope.object?.objectId) scopes.push({ type: scope.type, properties: await properties(scope.object.objectId) });
    }
    frames.push({ functionName: frame.functionName.slice(0, 256), location: frame.location, scopes });
  }
  const result = { reason: paused.reason, frames, propertyOperations: operations, sourceEvaluation: false,
    wasmScalarWrappersOnly: true, javascriptFramesInspected: 0 };
  if (JSON.stringify(result).length > 128 * 1024) throw new Error("Paused local diagnostic output cap");
  return result;
}
