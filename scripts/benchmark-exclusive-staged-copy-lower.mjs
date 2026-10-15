import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeLowerCopyDiagnostic } from "./lib/exclusive-copy-lower-baseline.mjs";
const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/benchmark-exclusive-staged-copy.mjs"), "utf8");
const recipe = makeLowerCopyDiagnostic(source, root);
await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
