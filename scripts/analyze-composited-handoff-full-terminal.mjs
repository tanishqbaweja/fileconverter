// Replay the complete independent source/birth/cleanup audit with new terminal semantics.
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("handoff-terminal-audit-");
try {
  const source=await readFile(path.join(root,"scripts/analyze-duration-drain-full-terminal.mjs"),"utf8");
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
  const named=relocated.replaceAll("2026-10-15T11-18-16-969Z","2026-10-15T17-48-11-250Z")
    .replaceAll("2026-10-15T11-18-08-401Z-duration-drain-supervisor-full","2026-10-15T17-47-58-210Z-composited-handoff-supervisor-full")
    .replaceAll("${stamp}-duration-drain","${stamp}-composited-handoff")
    .replaceAll("all656CurrentPostExecutedPreimagesVerified","all714CurrentPostExecutedPreimagesVerified");
  const uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const recipe=exactPatch(source,[[source,named],
    [named,'import '+JSON.stringify(uri("reliable-readonly-preflight.mjs"))+';\n'+named],
    ['const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));',`const root = ${JSON.stringify(root)}, read = file => readFile(path.join(root, file));`],
    [uri("duration-drain-full-sources.mjs"),uri("composited-handoff-full-sources.mjs")],
    [`import { inspectDurationFullTerminal } from ${JSON.stringify(uri("duration-drain-full-terminal.mjs"))};`,
      `import { inspectCompositedFullTerminal as inspectDurationFullTerminal } from ${JSON.stringify(uri("composited-handoff-full-terminal.mjs"))};`],
    ['Object.keys(archive.sourcePins).length, 656','Object.keys(archive.sourcePins).length, 714'],
    ['Where-Object {$durationAuditPids -contains $_.ProcessId}',
      'Where-Object {$durationAuditPids -contains $_.ProcessId -or $_.ParentProcessId -eq 21416 -or $_.ProcessId -eq 17908}'],
    ['const observed = JSON.parse(stdout); birthChecks = unique.map(identity => {',
      'const observed = JSON.parse(stdout); for(const row of observed){if(row.parentPid===21416)assert.ok(Date.parse(row.createdAt)>Date.parse(terminal.recordedAt),"No orphan validator from this owned driver");if(row.pid===17908)assert.notEqual(microsecondBirth(row.createdAt),microsecondBirth("2026-10-15T20:57:22.0841750Z"));} birthChecks = unique.map(identity => {'],
    ['["scripts/analyze-duration-drain-full-terminal.mjs", "scripts/lib/duration-drain-full-terminal.mjs"]',
      '["scripts/analyze-duration-drain-full-terminal.mjs","scripts/analyze-composited-handoff-full-terminal.mjs","scripts/lib/composited-handoff-full-terminal.mjs","tests/composited-handoff-full-terminal.test.mjs"]'],
    ['  losslesslyCompactedCheckpoint: {','  executedAuditorSource:{sha256:sha(await readFile(import.meta.filename)),preimage:(await readFile(import.meta.filename)).toString("base64")}, losslesslyCompactedCheckpoint: {'],
  ]);
  const file=path.join(runtime.directory,"audit.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
}finally{await runtime.close();}
