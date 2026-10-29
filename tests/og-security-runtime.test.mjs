import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { prepareOgNodeRuntime } from "../scripts/lib/prepare-og-node-runtime.mjs";
import { ogNodeBootstrapBanner,patchOgNodeBootstrap } from "../scripts/lib/og-node-bootstrap-patch.mjs";
import { readPreOgSecurityInput } from "./helpers/pre-og-security-inputs.mjs";
const json=async file=>JSON.parse(await readFile(file));
test("installed reviewed graph changes exactly five framework/font entries and keeps every converter engine intact",async()=>{
  const before=JSON.parse(await readPreOgSecurityInput("package-lock.json")),after=await json("package-lock.json"),pkg=await json("package.json");
  const keys=new Set([...Object.keys(before.packages),...Object.keys(after.packages)]);
  assert.deepEqual([...keys].filter(k=>JSON.stringify(before.packages[k])!==JSON.stringify(after.packages[k])).sort(),
    ["node_modules/@vercel/og","node_modules/@vercel/og/node_modules/@resvg/resvg-wasm","node_modules/css-gradient-parser","node_modules/harfbuzzjs","node_modules/satori"].sort());
  assert.equal(after.packages["node_modules/@vercel/og"].version,"1.0.3");assert.equal(after.packages["node_modules/satori"].version,"0.33.5");
  assert.equal(after.packages["node_modules/fflate"].version,"0.7.5");assert.equal(after.packages["node_modules/harfbuzzjs"].version,"0.10.0");
  assert.deepEqual(after.packages[""],before.packages[""]);assert.equal(pkg.overrides["vinext@0.0.50"]["@vercel/og"],"1.0.3");
  const install=await json("evidence/2026-10-29-og-security-install.json");assert.deepEqual(install.publicEnginesAfter,install.publicEnginesBefore);
  assert.equal(Object.keys(install.publicEnginesBefore).length,20);assert.equal(install.ownedScratchRemoved,true);
});
test("actual framework consumer resolves the patched module, bootstrap is idempotent, and bounded public PNG API still works",async()=>{
  const consumer=createRequire(path.resolve("node_modules/vinext/package.json"));
  const entry=consumer.resolve("@vercel/og"),bytes=await readFile(entry),proof=await prepareOgNodeRuntime(process.cwd());
  assert.equal(proof.alreadyPatched,true);assert.equal(bytes.toString().startsWith(ogNodeBootstrapBanner),true);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),proof.patchedSha256);assert.equal(patchOgNodeBootstrap(bytes).code,bytes.toString());
  const {ImageResponse}=await import(pathToFileURL(entry).href);
  const response=new ImageResponse({type:"div",props:{style:{display:"flex",width:32,height:16,backgroundColor:"#00ff00"}}},{width:32,height:16});
  assert.equal(response.headers.get("content-type"),"image/png");let total=0;const reader=response.body.getReader(),parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;assert.ok(total<=65536);parts.push(Buffer.from(value));}}
  finally{await reader.cancel();reader.releaseLock();}
  const png=Buffer.concat(parts);assert.equal(png.subarray(1,4).toString(),"PNG");assert.equal(png.readUInt32BE(16),32);assert.equal(png.readUInt32BE(20),16);
});
test("actual bundled escaping remediation and source maps do not substitute metadata labels for runtime evidence",async()=>{
  const proof=await json("evidence/2026-10-29-og-security-node-asset-candidate.json");assert.equal(proof.status,"passed-isolated-embedded-runtime-security-and-api-controls-not-installed");
  const [before,after]=proof.cases;assert.equal(before.cases.find(x=>x.name==="attribute-value").injectedPath,true);
  const safe=after.cases.find(x=>x.name==="attribute-value");assert.equal(safe.injectedPath,false);assert.equal(safe.escapedAttribute,true);
  for(const name of ["invalid-element","invalid-attribute","internal-style"])assert.equal(after.cases.find(x=>x.name===name).kind,"rejected");
  assert.equal(after.png.rgbaSha256,before.png.rgbaSha256);assert.equal(proof.audit.metadata.vulnerabilities.total,0);assert.equal(proof.ownedScratchRemoved,true);
  const source=await json("evidence/2026-10-29-og-embedded-zip-source-map.json");assert.equal(source.cases.length,2);
  for(const entry of source.cases)for(const file of entry.sourceCases){assert.ok(file.retainedMappings>0);assert.deepEqual(file.ranges.map(x=>x.name).sort(),["unzipSync","z64e"]);assert.ok(file.ranges.every(x=>x.mappedSegments===0));}
});
