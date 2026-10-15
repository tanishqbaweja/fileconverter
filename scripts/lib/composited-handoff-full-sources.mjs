// Same588-parent/128-file/2MiB additive seal; permit the two new compiled-asset gzip types.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
const root=path.resolve(import.meta.dirname,"../..");
const source=await readFile(path.join(root,"scripts/lib/duration-drain-full-sources.mjs"),"utf8");
const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
const recipe=exactPatch(source,[[source,relocated],
  ['mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\\.gz)?','mjs|js(?:\\.gz)?|ts|tsx|css(?:\\.gz)?|c|h|cs|ps1|json(?:\\.gz)?'],
  ['${stamp}-duration-drain-full-executed-sources','${stamp}-composited-handoff-full-executed-sources']]);
const components=await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
export const captureLayeredFullSourcePins=components.captureLayeredFullSourcePins;
export const writeLayeredFullSourceArchive=components.writeLayeredFullSourceArchive;
export const materializeLayeredFullSourceArchive=components.materializeLayeredFullSourceArchive;
export const loadHistoricalFullSourceBase=components.loadHistoricalFullSourceBase;
