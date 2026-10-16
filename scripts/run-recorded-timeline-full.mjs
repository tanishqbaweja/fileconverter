// Headless supervised changed-validator session. No automatic conversion restart.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {deriveRecordedTimelineCaller,deriveRecordedTimelineSupervisor} from "./lib/recorded-timeline-full-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),args=process.argv.slice(2);
if(args[0]==="--supervise"||args[0]==="--worker") {
  if(args[0]==="--supervise"){assert.equal(args.length,1);process.argv.splice(2,1,"--full");}
  const recipe=deriveRecordedTimelineSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);
  await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
}else {
  assert.ok(args.length===0||(args.length===1&&args[0]==="--prepare-only"));
  const recipe=deriveRecordedTimelineCaller(await readFile(path.join(root,"scripts/run-updated-chrome-full.mjs"),"utf8"),root);
  const runtime=await createOwnedRuntimeScratch("recorded-timeline-caller-");
  try {
    process.env.WITHIN_RECORDED_TIMELINE_CALLER_DIRECTORY=runtime.directory;
    const file=path.join(runtime.directory,"caller.mjs");await writeFile(file,recipe.generated,{flag:"wx"});await import(pathToFileURL(file).href);
  }finally{await runtime.close();}
}
