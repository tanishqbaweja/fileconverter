// Immutable compact source inputs for historical evidence, not live build policy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
const root=path.resolve(import.meta.dirname,".."),target=path.join(root,"fixtures/source/pre-og-security-patch-2026-10-29.json");
await assert.rejects(access(target),{code:"ENOENT"});
const pins={"package.json":"c13423c98132f9f1beaf9cdea8ceadf3436f7cf94031c873cc150f743bd5978c","package-lock.json":"b2c97a14d64528607b8acd6394350ea741db853de36fcd2f4d46789c4b3964a4"};
const archive={schemaVersion:1,sourceCommit:"c28d1bcf",scope:"Exact pre-OG dependency inputs for historical receipts only",files:{}};
for(const [file,digest]of Object.entries(pins)){const bytes=await readFile(path.join(root,file));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),digest);assert.ok(bytes.length<=1048576);
  archive.files[file]={bytes:bytes.length,sha256:digest,gzipBase64:gzipSync(bytes,{level:9}).toString("base64")};}
await writeFile(target,JSON.stringify(archive,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({path:path.relative(root,target),files:Object.keys(archive.files)}));
