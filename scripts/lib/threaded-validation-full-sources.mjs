// New bounded layer over the complete714-source executed parent; old limits/preimages stay intact.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export const THREAD_PARENT_FULL="evidence/2026-10-15T17-48-11-250Z-composited-handoff-original-full-terminal.json";
const root=path.resolve(import.meta.dirname,"../..");
export function makeThreadedSourceLayer(source,root) {
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
  const named=relocated.replaceAll("allParent588PreimagesReferencedNotDropped","allParent714PreimagesReferencedNotDropped");
  return exactPatch(source,[[source,named],
    [`import { materializeLayeredFullSourceArchive as materializeParent } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/mvf-arena-full-sources.mjs")).href)};`,
      `import { materializeLayeredFullSourceArchive as materializeParent } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/composited-handoff-full-sources.mjs")).href)};`],
    ["evidence/2026-10-14T22-43-44-516Z-mvf-arena-original-full-terminal.json",THREAD_PARENT_FULL],
    ["019667c4dafe93ffab2d23af4151b9f088ca2d66bf742bd7247a428856ca0a02","7be1cb9e34492b339fe561ec600c43925024aa1fe5c790707690581c5ef3a6ae"],
    ["parentFiles: 588","parentFiles: 714"],
    ["Object.keys(proof.sourcePins).length, 588","Object.keys(proof.sourcePins).length, 714"],
    ["sourceCount: 588","sourceCount: 714"],
    ["legacyFilesRetained: 588","legacyFilesRetained: 714"],
    ["parentPreimages: 588","parentPreimages: 714"],
    ["record.parentPreimages, 588","record.parentPreimages, 714"],
    ['mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\\.gz)?','mjs|js(?:\\.gz)?|ts|tsx|css(?:\\.gz)?|c|h|cs|ps1|json(?:\\.gz)?'],
    ['${stamp}-duration-drain-full-executed-sources','${stamp}-threaded-validation-full-executed-sources'],
  ]);
}
const recipe=makeThreadedSourceLayer(await readFile(path.join(root,"scripts/lib/duration-drain-full-sources.mjs"),"utf8"),root);
const components=await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
export const captureLayeredFullSourcePins=components.captureLayeredFullSourcePins;
export const writeLayeredFullSourceArchive=components.writeLayeredFullSourceArchive;
export const materializeLayeredFullSourceArchive=components.materializeLayeredFullSourceArchive;
export const loadHistoricalFullSourceBase=components.loadHistoricalFullSourceBase;
