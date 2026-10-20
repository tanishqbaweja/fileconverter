// Static private artifact integrity only; not conversion or route qualification.
import assert from "node:assert/strict";
import { readFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),proof=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-lto-build-39279724223.json")));
const directory=path.join(root,"work/mpeg2-lto-39279724223");
for(const name of ["LICENSE.ffmpeg","build-manifest.json","within-mpeg2-split.mjs","within-mpeg2-split.wasm"]) {
  test(`private native prerequisite ${name} exists with exact bounded recorded bytes/hash`,async()=>{
    const record=proof.files.find(row=>row.file===name);assert.ok(record&&record.bytes>0&&record.bytes<=8388608);
    const file=path.join(directory,name),before=await lstat(file);
    assert.ok(before.isFile()&&!before.isSymbolicLink());assert.equal(before.size,record.bytes);
    assert.equal(await realpath(file),file);const bytes=await readFile(file);
    assert.equal(bytes.length,record.bytes);assert.equal(sha(bytes),record.sha256);
  });
}
