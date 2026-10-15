import { readFile } from "node:fs/promises";
import path from "node:path";
import { makePhasedQuotaDiagnostic } from "./lib/exclusive-copy-phased-quota.mjs";
const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/benchmark-exclusive-staged-copy.mjs"), "utf8");
const recipe = makePhasedQuotaDiagnostic(source, root);
await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
