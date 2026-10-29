// Reproducible Node-only compatibility banner for the exact upstream1.0.3 entry.
// Original package/license and rendering logic stay unchanged; no global writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const ogNodeBootstrapPatch=Object.freeze({version:"1.0.3",
  originalSha256:"3269eb15ca135a0eb7e07ddf8af0b35711d6e75c56b84c6a6727c5626d59409c",
  upstreamCommit:"0dcef33bbd36555b070bb9d293991a86edb97c34",
  reason:"Bundled HarfBuzz CJS initialization needs local require plus its actual dependency directory; hb.wasm is not shipped in OGdist"});
export const ogNodeBootstrapBanner='// Within compatibility bootstrap; upstream @vercel/og1.0.3 rendering code unchanged.\n'+
  'import { createRequire as withinOgCreateRequire } from "node:module";\n'+
  'import { fileURLToPath as withinOgFileURLToPath } from "node:url";\n'+
  'import { dirname as withinOgDirname } from "node:path";\n'+
  'const require = withinOgCreateRequire(import.meta.url);\n'+
  'const withinOgSatoriRequire = withinOgCreateRequire(require.resolve("satori/package.json"));\n'+
  'const __dirname = withinOgDirname(withinOgSatoriRequire.resolve("harfbuzzjs"));\n';
const sha=value=>createHash("sha256").update(value).digest("hex");
export function patchOgNodeBootstrap(input){
  const text=Buffer.from(input).toString(),alreadyPatched=text.startsWith(ogNodeBootstrapBanner);
  const original=alreadyPatched?text.slice(ogNodeBootstrapBanner.length):text;
  assert.equal(sha(original),ogNodeBootstrapPatch.originalSha256,"Unknown OG module; never apply banner to a different package or mutated source");
  assert.equal(original.match(/\b__dirname\b/g)?.length,1,"Only the bundled HarfBuzz asset-directory read may be bridged");
  const code=ogNodeBootstrapBanner+original;
  return {code,proof:{...ogNodeBootstrapPatch,patchedSha256:sha(code),alreadyPatched,originalSourceRestored:true,
    moduleLocalRequireAndDirectoryOnly:true,globalsChanged:false,rendererOrCodecChanged:false}};
}
