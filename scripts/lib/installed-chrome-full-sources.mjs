// Same380 immutable legacy +128/2MiB supplement. Only qualified evidence
// descriptors and namespace added; no expanded cap or omitted preimage.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { reallocFullSourceDerivation } from "./realloc-full-sources.mjs";
const root=path.resolve(import.meta.dirname,"../.."),read=file=>readFile(path.join(root,file));
export const INSTALLED_CHROME_MEDIA_RECEIPT="evidence/2026-10-14T15-36-28-196Z-installed-chrome-realloc-media.json";
export const INSTALLED_CHROME_QUALIFICATION="evidence/2026-10-14T15-36-28-196Z-installed-chrome-realloc-independent-qualification.json";
const bytes=await read(INSTALLED_CHROME_MEDIA_RECEIPT);assert.equal(sha(bytes),"fbcea9865553d330e001acee987d2b9baf9df199a835fb275980e8dafdefe47c");
const media=JSON.parse(bytes),external={...reallocFullSourceDerivation.external};
for(const [file,hash] of [[INSTALLED_CHROME_MEDIA_RECEIPT,sha(bytes)],[media.generatedArchive.path,media.generatedArchive.sha256],[media.report.archive.path,media.report.archive.sha256]]) {
  const value=await read(file);assert.equal(sha(value),hash);external[file]={bytes:value.length,sha256:hash};
}
assert.ok(Object.keys(external).length<=16);
const original=(await read("scripts/lib/packet-largest-idle-full-sources.mjs")).toString();assert.equal(sha(original),"7e4b516449dacebb17aa56124a7aae7ad1ccd2fa07709f4c414ae60b881b1c7b");
const before="const external = Object.freeze({\n",after=before+Object.entries(external).map(([file,row])=>`  ${JSON.stringify(file)}: ${JSON.stringify(row)},\n`).join("");
assert.equal(original.split(before).length,2);let generated=original.replace(before,after);
const oldName="${stamp}-packet-largest-idle-full-executed-sources.json.gz",newName="${stamp}-installed-chrome-realloc-full-executed-sources.json.gz";
assert.equal(generated.split(oldName).length,2);generated=generated.replace(oldName,newName);assert.equal(generated.replace(newName,oldName).replace(after,before),original);
generated=generated.replace(/from "(\.\/[^"\r\n]+)"/g,(_,name)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",name)).href)}`);
const factory=await import("data:text/javascript;base64,"+Buffer.from(generated).toString("base64"));
export const loadHistoricalFullSourceBase=factory.loadHistoricalFullSourceBase;
export const captureLayeredFullSourcePins=factory.captureLayeredFullSourcePins;
export const writeLayeredFullSourceArchive=factory.writeLayeredFullSourceArchive;
export const materializeLayeredFullSourceArchive=factory.materializeLayeredFullSourceArchive;
export const SUPPLEMENTAL_LIMITS=factory.SUPPLEMENTAL_LIMITS;
export const installedChromeFullSourceDerivation=Object.freeze({originalSha256:sha(original),generatedSha256:sha(generated),external,sourceCapsChanged:false,legacyFiles:380,supplementalFiles:128});
