// Preserve ALL380 immutable legacy preimages and <=128/2MiB supplement caps.
// Qualified external evidence remains recoverable from its pinned bytes and
// the actual249-source archive, never silently omitted to fit the envelope.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive as materializePrevious } from "./packet-largest-idle-full-sources.mjs";
const root=path.resolve(import.meta.dirname,"../.."),read=file=>readFile(path.join(root,file));
export const REALLOC_FULL_MEDIA_RECEIPT="evidence/2026-10-14T09-09-29-345Z-journaled-realloc-media.json";
export const PREVIOUS_LARGEST_IDLE_FULL_RECEIPT="evidence/2026-10-13T01-28-09-516Z-packet-largest-idle-original-full-terminal.json";
const mediaBytes=await read(REALLOC_FULL_MEDIA_RECEIPT);assert.equal(sha(mediaBytes),"2ebbeb5c9065683cf4f6a94c5343a76c6a12d75eea2dc6f5161e2fc77e8ed549");
const media=JSON.parse(mediaBytes),archiveBytes=await read(media.generatedArchive.path);assert.equal(sha(archiveBytes),media.generatedArchive.sha256);
const restored=gunzipSync(archiveBytes,{maxOutputLength:8388608});assert.equal(sha(restored),media.generatedArchive.restoredSha256);
const mediaArchive=JSON.parse(restored);assert.deepEqual(mediaArchive.sourcePins,media.sourcePins);assert.equal(Object.keys(media.sourcePins).length,249);
const external={};
for(const [file,hash] of Object.entries(media.sourcePins)) {
  assert.equal(sha(mediaArchive.sources[file]),hash,file);
  if(!file.startsWith("evidence/")||!file.endsWith(".json"))continue;
  const bytes=await read(file);assert.equal(sha(bytes),hash,file);
  if(bytes.length>=50000)external[file]={bytes:bytes.length,sha256:hash};
}
for(const [file,expected] of [
  [REALLOC_FULL_MEDIA_RECEIPT,"2ebbeb5c9065683cf4f6a94c5343a76c6a12d75eea2dc6f5161e2fc77e8ed549"],
  ["evidence/2026-10-14T09-09-29-345Z-journaled-realloc-media-independent-qualification.json","0b65658817244df549b3c5046d814fb1fccc227482cb07a12d3f8759791bf838"],
  [PREVIOUS_LARGEST_IDLE_FULL_RECEIPT,"69552dc753da455335b4b267052c89cbc76e1913ded6b5bfd8f9f3249a7cb1ef"],
  [media.generatedArchive.path,media.generatedArchive.sha256],[media.report.archive.path,media.report.archive.sha256],
]) {const bytes=await read(file);assert.equal(sha(bytes),expected);external[file]={bytes:bytes.length,sha256:expected};}
const previous=JSON.parse(await read(PREVIOUS_LARGEST_IDLE_FULL_RECEIPT));
const previousArchiveBytes=await read(previous.sourceArchive.path);assert.equal(sha(previousArchiveBytes),previous.sourceArchive.sha256);
external[previous.sourceArchive.path]={bytes:previousArchiveBytes.length,sha256:previous.sourceArchive.sha256};
assert.ok(Object.keys(external).length<=16);
const original=(await read("scripts/lib/packet-largest-idle-full-sources.mjs")).toString();
assert.equal(sha(original),"7e4b516449dacebb17aa56124a7aae7ad1ccd2fa07709f4c414ae60b881b1c7b");
const before="const external = Object.freeze({\n",after=before+Object.entries(external).map(([file,row])=>`  ${JSON.stringify(file)}: ${JSON.stringify(row)},\n`).join("");
assert.equal(original.split(before).length,2);let generated=original.replace(before,after);
const oldName="${stamp}-packet-largest-idle-full-executed-sources.json.gz",newName="${stamp}-realloc-full-executed-sources.json.gz";
assert.equal(generated.split(oldName).length,2);generated=generated.replace(oldName,newName);
assert.equal(generated.replace(newName,oldName).replace(after,before),original);
generated=generated.replace(/from "(\.\/[^"\r\n]+)"/g,(_,name)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",name)).href)}`);
const factory=await import("data:text/javascript;base64,"+Buffer.from(generated).toString("base64"));
export const loadHistoricalFullSourceBase=factory.loadHistoricalFullSourceBase;
export const loadLegacyFullSources=factory.loadLegacyFullSources;
export const captureLayeredFullSourcePins=factory.captureLayeredFullSourcePins;
export const writeLayeredFullSourceArchive=factory.writeLayeredFullSourceArchive;
export const materializeLayeredFullSourceArchive=factory.materializeLayeredFullSourceArchive;
export const SUPPLEMENTAL_LIMITS=factory.SUPPLEMENTAL_LIMITS;
export const reallocFullSourceDerivation=Object.freeze({originalSha256:sha(original),generatedSha256:sha(generated),external,
  legacyFiles:380,supplementalFiles:128,supplementalRestoredBytes:2097152,sourceCapsChanged:false,qualifiedPreimagesNotOmitted:true});
export async function loadPreviousLargestIdleFullSources(taskRoot=root) {
  const bytes=await readFile(path.join(taskRoot,PREVIOUS_LARGEST_IDLE_FULL_RECEIPT));assert.equal(sha(bytes),external[PREVIOUS_LARGEST_IDLE_FULL_RECEIPT].sha256);
  const proof=JSON.parse(bytes);assert.equal(Object.keys(proof.sourcePins).length,439);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  const archive=await materializePrevious(taskRoot,proof.sourceArchive);assert.deepEqual(archive.sourcePins,proof.sourcePins);
  return {proof,archive,reference:{path:PREVIOUS_LARGEST_IDLE_FULL_RECEIPT,sha256:sha(bytes),sourceCount:439}};
}
