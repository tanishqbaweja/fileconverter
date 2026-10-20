import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=process.cwd(),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/lto-native-sources-39279724223.json"));
const build=JSON.parse(await read(proof.proof.path));
test("actual138 executed source preimages retain the original per-layer limits and compile-only provenance",async()=>{
  assert.equal(proof.sourceCount,138);assert.deepEqual(proof.layers.map(row=>row.sourceCount),[126,12]);
  const combined={};
  for(const layer of proof.layers){
    assert.ok(layer.sourceCount<=128);const zip=await read(layer.archive.path);assert.equal(sha(zip),layer.archive.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:2097152});assert.equal(sha(raw),layer.archive.restoredSha256);const value=JSON.parse(raw);
    for(const [file,digest]of Object.entries(value.sourcePins)){assert.equal(sha(Buffer.from(value.preimages[file],"base64")),digest);combined[file]=digest;}
  }
  assert.deepEqual(combined,build.manifest.sources);assert.equal(proof.speedGainProven,false);assert.equal(proof.conversions,0);
});
test("actual decoder is larger; typed function IDs and relocated guard slots are retained, not reused from baseline",()=>{
  assert.equal(proof.decoder.bytes,6360544);assert.equal(proof.decoderBytesIncrease,644559);
  assert.equal(proof.functions.length,11);assert.equal(proof.parentFunctions.length,11);
  for(const row of proof.functions){assert.ok(Number.isInteger(row.functionIndex));assert.match(row.bodySha256,/^[a-f0-9]{64}$/);}
  assert.equal(proof.layout._gm_.address,408936);assert.equal(proof.layout.within_refstruct_abort_words.address,1913344);
  assert.equal(proof.oldIndicesOrAddressesMustNotBeReused,true);assert.equal(proof.actualRuntimeFatalRequalified,false);
  assert.equal(proof.browserCompositionMustKeepEncoderSha256,"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
});
