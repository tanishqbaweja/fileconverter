// Diagnostic counters only. Original branch conditions/depths and all render
// instructions survive byte-for-byte; removeAllocationProbe reverses the edit.
import assert from "node:assert/strict";
import { wasmSections } from "./published-version-witnesses.mjs";
import { sha } from "./source-pins.mjs";
export const allocationProbeBaselineSha256 = "4068ccdc36f10df407150752bcae5af699dd1190700c5ebb78e578ea9aafab9d";
export const allocationProbeExportNames = Object.freeze(["__within_svg_probe_site", "__within_svg_probe_value"]);
export const allocationProbeSites = Object.freeze([
  { site: 1, offset: 0x1a8ed8, depth: 6, local: 9, kind: "payload-allocation-null" },
  { site: 2, offset: 0x1a8f0a, depth: 5, constant: 28, kind: "header-allocation-null" },
  { site: 3, offset: 0x1a8f6e, depth: 5, local: 9, kind: "payload-allocation-null" },
  { site: 4, offset: 0x1a90ab, depth: 4, constant: 28, kind: "header-allocation-null" },
  { site: 5, offset: 0x1a9155, depth: 2, local: 9, kind: "reference-count-overflow" },
].map(Object.freeze));
function integer(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff);
  const bytes = []; do { const part = value % 128; value = Math.floor(value / 128); bytes.push(part | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}
function readInteger(bytes, start) {
  let value = 0, end = start;
  for (let index = 0; index < 5; index++) {
    assert.ok(end < bytes.length); const byte = bytes[end++]; value += (byte & 127) * 2 ** (7 * index);
    if (!(byte & 128)) return { value, end };
  }
  throw new Error("Unbounded probe integer");
}
function sections(bytes) {
  let previous = 8;
  return wasmSections(bytes).map(section => { const result = { ...section, header: previous, payload: bytes.subarray(section.start, section.end) }; previous = section.end; return result; });
}
function replaceSections(bytes, replacements) {
  return Buffer.concat([bytes.subarray(0,8), ...sections(bytes).map(row => replacements.has(row.id)
    ? Buffer.concat([Buffer.from([row.id]), integer(replacements.get(row.id).length), replacements.get(row.id)])
    : bytes.subarray(row.header,row.end))]);
}
function findBody(payload, definedIndex) {
  const count = readInteger(payload,0); assert.ok(definedIndex >= 0 && definedIndex < count.value);
  let cursor = count.end;
  for (let index=0; index<count.value; index++) {
    const size=readInteger(payload,cursor), end=size.end+size.value; assert.ok(end <= payload.length);
    if (index === definedIndex) return { header: cursor, start: size.end, end };
    cursor=end;
  }
  throw new Error("Missing probe target body");
}
function exportsFor(firstGlobal) {
  return Buffer.concat(allocationProbeExportNames.map((name,index) => {
    const text=Buffer.from(name); return Buffer.concat([integer(text.length),text,Buffer.from([3]),integer(firstGlobal+index)]);
  }));
}
export function allocationProbePrefix(site, firstGlobal) {
  assert.ok(allocationProbeSites.includes(site));
  return Buffer.concat([Buffer.from([0x41,site.site,0x24]),integer(firstGlobal),
    Buffer.from([site.local === undefined ? 0x41 : 0x20, site.local ?? site.constant, 0x24]),integer(firstGlobal+1)]);
}
const probeBytes = allocationProbePrefix;
const initialGlobals=Buffer.from([0x7f,1,0x41,0,0x0b,0x7f,1,0x41,0,0x0b]);
export function addAllocationProbe(input) {
  const bytes=Buffer.from(input); assert.equal(sha(bytes),allocationProbeBaselineSha256);
  const wasmModule=new WebAssembly.Module(bytes), imports=WebAssembly.Module.imports(wasmModule);
  assert.equal(imports.filter(row => row.kind === "global").length,0);
  const functionImports=imports.filter(row => row.kind === "function").length;
  const table=sections(bytes), global=table.find(row => row.id===6), exported=table.find(row => row.id===7), code=table.find(row => row.id===10);
  assert.ok(global && exported && code);
  const globals=readInteger(global.payload,0), exportCount=readInteger(exported.payload,0), body=findBody(code.payload,532-functionImports);
  const globalPayload=Buffer.concat([integer(globals.value+2),global.payload.subarray(globals.end),initialGlobals]);
  const exportPayload=Buffer.concat([integer(exportCount.value+2),exported.payload.subarray(exportCount.end),exportsFor(globals.value)]);
  const parts=[]; let cursor=body.start;
  for (const site of allocationProbeSites) {
    const at=site.offset-code.start; assert.ok(at >= cursor && at < body.end);
    assert.deepEqual([...code.payload.subarray(at,at+2)],[0x0d,site.depth],"Exact original conditional branch");
    parts.push(code.payload.subarray(cursor,at),probeBytes(site,globals.value)); cursor=at;
  }
  parts.push(code.payload.subarray(cursor,body.end)); const newBody=Buffer.concat(parts);
  const codePayload=Buffer.concat([code.payload.subarray(0,body.header),integer(newBody.length),newBody,code.payload.subarray(body.end)]);
  const result=replaceSections(bytes,new Map([[6,globalPayload],[7,exportPayload],[10,codePayload]]));
  assert.ok(WebAssembly.validate(result));
  const newModule=new WebAssembly.Module(result);
  assert.deepEqual(WebAssembly.Module.imports(newModule),imports);
  assert.deepEqual(WebAssembly.Module.exports(newModule).filter(row => !allocationProbeExportNames.includes(row.name)),WebAssembly.Module.exports(wasmModule));
  assert.deepEqual(removeAllocationProbe(result),bytes,"Removing only probes must restore every original byte");
  const newCode=sections(result).find(row => row.id===10), newBodyLocation=findBody(newCode.payload,532-functionImports);
  const delta=newCode.start+newBodyLocation.start-(code.start+body.start)+allocationProbeSites.reduce((n,s) => n+probeBytes(s,globals.value).length,0);
  return { bytes: result, proof: { baselineSha256: sha(bytes), instrumentedSha256: sha(result), baselineBytes: bytes.length, instrumentedBytes: result.length,
    originalFunctionIndex:532, originalTrapOffset:0x1a9198, instrumentedTrapOffset:0x1a9198+delta,
    sites:allocationProbeSites, globals:allocationProbeExportNames, renderInstructionsAndOriginalBranchesPreserved:true,
    reversibleWholeModuleByteEquality:true, linearMemorySectionChanged:false, acceptanceMetric:false } };
}
export function removeAllocationProbe(input) {
  const bytes=Buffer.from(input); assert.ok(bytes.length > 8 && bytes.length <= 16 * 1024 ** 2);
  const wasmModule=new WebAssembly.Module(bytes), table=sections(bytes);
  const global=table.find(row => row.id===6), exported=table.find(row => row.id===7), code=table.find(row => row.id===10);
  const globals=readInteger(global.payload,0), exportCount=readInteger(exported.payload,0), firstGlobal=globals.value-2;
  assert.ok(firstGlobal >= 0); assert.deepEqual(global.payload.subarray(-10),initialGlobals);
  const extraExports=exportsFor(firstGlobal); assert.deepEqual(exported.payload.subarray(-extraExports.length),extraExports);
  const importedFunctions=WebAssembly.Module.imports(wasmModule).filter(row => row.kind === "function").length;
  const body=findBody(code.payload,532-importedFunctions);
  const bodyBytes=code.payload.subarray(body.start,body.end);
  const pieces=[]; let cursor=0;
  for (const site of allocationProbeSites) {
    const probe=probeBytes(site,firstGlobal), at=bodyBytes.indexOf(probe,cursor);
    assert.ok(at >= cursor && at+probe.length <= bodyBytes.length);
    assert.equal(bodyBytes.indexOf(probe,at+1),-1,"Exactly one tagged probe site per function");
    assert.deepEqual(bodyBytes.subarray(at,at+probe.length),probe);
    assert.deepEqual([...bodyBytes.subarray(at+probe.length,at+probe.length+2)],[0x0d,site.depth]);
    pieces.push(bodyBytes.subarray(cursor,at)); cursor=at+probe.length;
  }
  pieces.push(bodyBytes.subarray(cursor)); const originalBody=Buffer.concat(pieces);
  const result=replaceSections(bytes,new Map([
    [6,Buffer.concat([integer(firstGlobal),global.payload.subarray(globals.end,-10)])],
    [7,Buffer.concat([integer(exportCount.value-2),exported.payload.subarray(exportCount.end,-extraExports.length)])],
    [10,Buffer.concat([code.payload.subarray(0,body.header),integer(originalBody.length),originalBody,code.payload.subarray(body.end)])],
  ]));
  assert.equal(sha(result),allocationProbeBaselineSha256,"No non-probe binary change may survive reversal");
  return result;
}
export function classifyAllocationProbeFailure(probe, proof, stack) {
  if (!Number.isSafeInteger(proof?.instrumentedTrapOffset)) return null;
  if (!probe || !Number.isInteger(probe.site) || !Number.isInteger(probe.value) || probe.value < 0 || probe.value > 0xffffffff) return null;
  const site=allocationProbeSites.find(row => row.site === probe.site); if (!site || typeof stack !== "string") return null;
  const frame=stack.split("\n").find(line => /wasm-function\[/.test(line));
  if (!frame?.includes("resvg::filter::get_input")) return null;
  const match=/wasm-function\[(\d+)\]:0x([0-9a-f]+)/.exec(frame);
  if (!match || Number(match[1]) !== 532 || Number.parseInt(match[2],16) !== proof.instrumentedTrapOffset) return null;
  return { site:site.site, kind:site.kind, observedValue:probe.value,
    attemptedAllocationBytes:site.kind === "reference-count-overflow" ? null : probe.value,
    exactNativeTrapAndProbeMatched:true, broaderHeapCauseOrOptimizationProven:false };
}
