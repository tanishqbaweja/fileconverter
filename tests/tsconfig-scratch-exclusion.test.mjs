import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("project typing excludes disposable owned scratch while retaining application, workers and browser tests",async()=>{
  const root=path.resolve(import.meta.dirname,".."),runtime=await createOwnedRuntimeScratch("tsconfig-unit-");
  try {
    const temporary=path.join(runtime.directory,"candidate.spec.ts");
    await writeFile(temporary,"const disposable: number = 'not production TypeScript';\n",{flag:"wx"});
    const source=ts.readConfigFile(path.join(root,"tsconfig.json"),ts.sys.readFile);assert.equal(source.error,undefined);
    const parsed=ts.parseJsonConfigFileContent(source.config,ts.sys,root,undefined,path.join(root,"tsconfig.json"));
    const canonical=file=>path.resolve(file).replaceAll("\\","/");
    const included=new Set(parsed.fileNames.map(canonical));
    assert.deepEqual(parsed.errors,[]);assert.ok(![...included].some(file=>file===canonical(temporary)||file.startsWith(canonical(path.join(root,"work"))+"/")));
    for(const file of ["app/converter/ConverterApp.tsx","lib/capability-registry.ts","workers/conversion.worker.ts",
      "workers/staged-save.worker.ts","tests/browser/media-remux.spec.ts"])
      assert.ok(included.has(canonical(path.join(root,file))),file);
  } finally {await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
