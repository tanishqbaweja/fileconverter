import assert from "node:assert/strict";
import { lstat,readFile,realpath,writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { patchOgNodeBootstrap } from "./og-node-bootstrap-patch.mjs";
export async function prepareOgNodeRuntime(root){
  const require=createRequire(path.join(root,"node_modules/vinext/package.json"));
  const packageFile=require.resolve("@vercel/og/package.json"),pkg=JSON.parse(await readFile(packageFile));
  assert.equal(pkg.version,"1.0.3");const file=path.join(path.dirname(packageFile),"dist/index.node.js");
  const resolved=await realpath(file),relative=path.relative(path.join(root,"node_modules"),resolved);
  assert.ok(relative&&!relative.startsWith("..")&&!path.isAbsolute(relative),"Never patch outside this repository's installed dependencies");
  assert.equal(path.resolve(file).toLowerCase(),resolved.toLowerCase());
  const stat=await lstat(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink());
  const before=await readFile(file);const result=patchOgNodeBootstrap(before);
  if(!result.proof.alreadyPatched)await writeFile(file,result.code);
  assert.equal((await readFile(file)).toString(),result.code);
  return result.proof;
}
