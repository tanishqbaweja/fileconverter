// Same offline captured-word guards. Only the exact decoder identity changes;
// shared slot addresses and schemas are independently verified on the new core.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { reallocFailureValidatorDerivation } from "./realloc-full-failure-record.mjs";
const root=path.resolve(import.meta.dirname,"../.."),source=await readFile(path.join(root,"scripts/lib/composite-allocation-failure-record.mjs"),"utf8");
assert.equal(sha(source),reallocFailureValidatorDerivation.originalSha256);
const edits=reallocFailureValidatorDerivation.edits.map(([before,after],index)=>[before,index===0?
  `import { EBML_DECODER_SHA256 as ALLOCATION_ATTEMPT_DECODER_SHA256 } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/ebml-reuse-browser-components.mjs")).href)};\n`+
  `import { validatePendingReallocRecord } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/realloc-full-failure-record.mjs")).href)};`:after]);
let generated=source;for(const [before,after]of edits){assert.equal(generated.split(before).length,2);generated=generated.replace(before,after);}
let reversed=generated;for(const [before,after]of edits.toReversed())reversed=reversed.replace(after,before);assert.equal(reversed,source);
generated=generated.replace(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm,(match,file)=>
  match.replace(`from "${file}"`,`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`));
const factory=await import("data:text/javascript;base64,"+Buffer.from(generated).toString("base64"));
export const validateCompositeAllocationFailureRecord=factory.validateCompositeAllocationFailureRecord;
export const ebmlFailureDerivation=Object.freeze({originalSha256:sha(source),generatedSha256:sha(generated),edits,
  capturedWordGuardsChanged:false,heapOrModuleFabricated:false,internalMallocSizeInferred:false,publicAcceptance:false});
