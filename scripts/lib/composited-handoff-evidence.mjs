import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { verifyCompositedBuild } from "./composited-handoff-recipe.mjs";
const root=path.resolve(import.meta.dirname,"../..");
const source=await readFile(path.join(root,"scripts/lib/staged-handoff-evidence.mjs"),"utf8");
const recipe=exactPatch(source,[["-staged-worker-handoff-build.json","-composited-handoff-build.json"],
  ['"./stable-ui-headless-baseline-recipe.mjs"',JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/stable-ui-headless-baseline-recipe.mjs")).href)]]);
const components=await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
export function verifyHandoffBuildAndEvents(...args) {
  verifyCompositedBuild(args[0]);return components.verifyHandoffBuildAndEvents(...args);
}
