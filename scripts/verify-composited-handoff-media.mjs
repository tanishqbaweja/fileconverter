// Reuse the complete independent auditor; only exact new identities/counts change.
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("composited-handoff-audit-");
try {
  const source=await readFile(path.join(root,"scripts/verify-staged-handoff-media.mjs"),"utf8");
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
  const renamed=relocated.replaceAll("staged-handoff","composited-handoff")
    .replaceAll("composited-handoff-media-recipe.mjs","composited-handoff-media.mjs");
  const recipe=exactPatch(source,[[source,renamed],
    ['const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));',`const root = ${JSON.stringify(root)}, read = file => readFile(path.join(root, file));`],
    ['[supplement, extra, 95, "base64"]','[supplement, extra, 106, "base64"]'],
    ['supplement.distinctTotalFiles, 350','supplement.distinctTotalFiles, 361'],
    ['distinctBuildAndMediaFiles, 356','distinctBuildAndMediaFiles, 367'],
    ['mediaSupplemental: 95, totalMedia: 350','mediaSupplemental: 106, totalMedia: 361'],
    ['buildCaptured: 17','buildCaptured: 20'],
    ['["scripts/verify-composited-handoff-media.mjs", "scripts/lib/composited-handoff-evidence.mjs", "tests/composited-handoff-evidence.test.mjs"]',
      '["scripts/verify-staged-handoff-media.mjs","scripts/lib/staged-handoff-evidence.mjs","scripts/verify-composited-handoff-media.mjs", "scripts/lib/composited-handoff-evidence.mjs", "tests/composited-handoff-evidence.test.mjs"]'],
    ['  analysis, birthChecks, sampledPidChecks,','  analysis, birthChecks, sampledPidChecks, executedAuditorSource:{sha256:sha(await readFile(import.meta.filename)),preimage:(await readFile(import.meta.filename)).toString("base64")},'],
  ]);
  const file=path.join(runtime.directory,"audit.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
}finally{await runtime.close();}
