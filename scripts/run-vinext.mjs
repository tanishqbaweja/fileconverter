// Keep the exact package's Node bootstrap reproducible even after npm ci --ignore-scripts.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareOgNodeRuntime } from "./lib/prepare-og-node-runtime.mjs";
const root=path.resolve(import.meta.dirname,".."),args=process.argv.slice(2);
assert.ok(["dev","build","start"].includes(args[0])&&args.length<=32);
await prepareOgNodeRuntime(root);
const preload=pathToFileURL(path.join(root,"scripts/lib/hidden-unit-subprocesses.mjs")).href;
const env={...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS??"","--import="+preload].filter(Boolean).join(" "),NEXT_TELEMETRY_DISABLED:"1",WRANGLER_SEND_METRICS:"false"};
const child=spawn(process.execPath,[path.join(root,"node_modules/vinext/dist/cli.js"),...args],{cwd:root,env,windowsHide:true,stdio:"inherit"});
const code=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>signal?reject(new Error("Vinext exited by "+signal)):resolve(code));});
process.exitCode=code??1;
