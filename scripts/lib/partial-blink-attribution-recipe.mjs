// Historical failed sources remain unchanged. This keeps caps and failed status,
// admits only actual closed-GUID partial records, and retains bounded raw trace.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeDetailedBlinkAttribution } from "./largest-blink-attribution-recipe.mjs";
export function makePartialBlinkAttribution(source,root,archivePath){
  assert.equal(path.dirname(archivePath),path.join(root,"outputs","reports"));
  assert.match(path.basename(archivePath),/^[a-zA-Z0-9-]+-partial-blink-trace\.json\.gz$/);
  const old=makeDetailedBlinkAttribution(source,root);
  const uri=name=>JSON.stringify(pathToFileURL(path.join(root,`scripts/lib/${name}.mjs`)).href);
  const patches=[
    [`from ${uri("largest-blink-type-summary")};`,`from ${uri("partial-largest-blink-type-summary")};`],
    ['import assert from "node:assert/strict";',`import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const rawArchivePath=${JSON.stringify(archivePath)};`],
    ['        if (!overflow) {',`        let rawArchive=null;
        if (!overflow) {
          const compressed=gzipSync(Buffer.concat(chunks),{level:9});
          assert.ok(compressed.length<=4194304,"Bounded diagnostic archive; not media");
          await writeFile(rawArchivePath,compressed,{flag:"wx"});
          rawArchive={path:rawArchivePath,bytes:compressed.length,sha256:createHash("sha256").update(compressed).digest("hex"),
            reconstructsExactSerializedTrace:true,maximumBytes:4194304};`],
    ['compactedBeforeRelease: Boolean(summary), rawRetained: false','compactedBeforeRelease: Boolean(summary), rawRetained: Boolean(rawArchive), rawArchive'],
  ];
  let result=old;
  for(const[before,after]of patches){assert.equal(result.split(before).length,2,before);result=result.replace(before,after);}
  let reversed=result;
  for(const[before,after]of [...patches].reverse()){assert.equal(reversed.split(after).length,2,after);reversed=reversed.replace(after,before);}
  assert.equal(reversed,old,"Only explicitly partial summary and bounded raw retention; failed global status/caps unchanged");
  return result;
}
