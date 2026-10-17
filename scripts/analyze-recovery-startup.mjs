import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/analyze-recovery-discovery.mjs"), "utf8");
// Derive the already verified strict archive/source/cleanup audit; only the
// observation and concrete run/source-count/output bindings differ.
let generated = source.replaceAll("2026-10-17T20-58-20-928Z", "2026-10-17T21-16-09-336Z")
  .replaceAll("recovery-discovery", "recovery-startup")
  .replaceAll("inspectRecoveryDiscovery", "inspectUntracedStartup")
  .replaceAll("816", "818")
  .replace('const root = path.resolve(import.meta.dirname, "..");', `const root = ${JSON.stringify(root)};`)
  .replace("No execution trace was collected. Inspect actual category discovery and test event selection in a short browser-only capability probe before another full conversion sequence. Missing discovery metadata does not prove unsupported event categories.",
    "Corrected event selection never ran: first conversion breached before recovery hook. Add a separate bounded cold-start event window, closed before warm recovery, so the next actual failure is observed. Functional category proof is already established; do not repeat it unchanged.");
generated = generated.replace(/^(import[^\r\n]*?\bfrom )"(\.[^"\r\n]+)"/gm,
  (_, prefix, file) => prefix + JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href));
generated = generated.replace('import.meta.resolve("esbuild")', JSON.stringify(import.meta.resolve("esbuild")));
assert.ok(generated.includes('"evidence/2026-10-17T21-16-09-336Z-recovery-runtime-control-terminal.json"'));
await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
