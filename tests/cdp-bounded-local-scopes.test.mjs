import assert from "node:assert/strict";
import test from "node:test";
import { captureBoundedLocalScopes } from "../scripts/lib/cdp-bounded-local-scopes.mjs";
const scope = objectId => ({ type: "local", object: { objectId } });
const frame = (functionName, scriptId, objectId) => ({ functionName, location: { scriptId }, scopeChain: [scope(objectId)] });

test("Debugger reads only verified Wasm scalar wrappers, never JS media objects or getters", async () => {
  const calls = [];
  const send = async (method, params) => {
    calls.push([method, params.objectId]);
    assert.equal(params.ownProperties, true); assert.equal(params.generatePreview, false);
    if (params.objectId === "wasm-local") return { result: [
      { name: "$var0", value: { type: "object", subtype: "wasmvalue", objectId: "scalar" } },
      { name: "heap", value: { type: "object", subtype: "typedarray", objectId: "DO_NOT_READ" } },
      { name: "getter", get: { objectId: "DO_NOT_INVOKE" } },
    ] };
    assert.equal(params.objectId, "scalar"); return { result: [{ name: "value", value: { type: "number", value: 123456 } }] };
  };
  const result = await captureBoundedLocalScopes(send, { reason: "other", callFrames: [
    frame("$av_malloc", "wasm", "wasm-local"), frame("host", "js", "DO_NOT_READ_JS"),
    frame("$hevc_receive_frame", "wasm", "DO_NOT_READ_NONSELECTED"),
  ] }, new Set(["wasm"]), new Set(["av_malloc"]));
  assert.deepEqual(calls, [["Runtime.getProperties", "wasm-local"], ["Runtime.getProperties", "scalar"]]);
  assert.equal(result.frames.length, 1); assert.equal(result.frames[0].scopes[0].properties[0].children[0].value, 123456);
  assert.equal(result.frames[0].scopes[0].properties[2].accessorUnavailable, true);
  assert.equal(result.sourceEvaluation, false); assert.equal(result.javascriptFramesInspected, 0);
});
test("Unknown locals remain null; malformed, unverified, excessive and unavailable property inventories fail closed", async () => {
  const event = { callFrames: [frame("$probe", "wasm", "local")] };
  await assert.rejects(captureBoundedLocalScopes(() => {}, event), /Verified Wasm/);
  await assert.rejects(captureBoundedLocalScopes(() => {}, { callFrames: new Array(129) }, new Set()), /frame inventory/);
  await assert.rejects(captureBoundedLocalScopes(async () => ({ result: new Array(129) }), event, new Set(["wasm"])), /count cap/);
  await assert.rejects(captureBoundedLocalScopes(async () => ({ exceptionDetails: {} }), event, new Set(["wasm"])), /unavailable/);
  const result = await captureBoundedLocalScopes(async () => ({ result: [{ name: "$var0", value: { type: "number" } }] }), event, new Set(["wasm"]));
  assert.equal(result.frames[0].scopes[0].properties[0].value, null);
});
