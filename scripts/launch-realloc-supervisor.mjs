import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeReallocSupervisorRecipe } from "./lib/realloc-supervisor-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),source=await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8");
const recipe=makeReallocSupervisorRecipe(source,root);
await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
