import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "../scripts/lib/owned-runtime-scratch.mjs";

const exec = promisify(execFile), work = path.resolve(import.meta.dirname, "../work");
test("owned scratch isolates a real child temp environment and is removed idempotently after failure", async () => {
  const original = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
  const scratch = await createOwnedRuntimeScratch("scratch-unit-");
  try {
    assert.equal(path.dirname(scratch.directory), work);
    const { stdout } = await exec(process.execPath, ["-e",
      "const fs=require('fs'),p=require('path'),os=require('os');fs.mkdirSync(p.join(os.tmpdir(),'child-runtime'));fs.writeFileSync(p.join(os.tmpdir(),'child-runtime','marker.json'),JSON.stringify({temp:process.env.TEMP,tmp:process.env.TMP,tmpdir:os.tmpdir()}));console.log(os.tmpdir());process.exitCode=7;"],
    { env: scratch.env, windowsHide: true }).catch((error) => { assert.equal(error.code, 7); return error; });
    assert.equal(stdout.trim(), scratch.directory);
    const values = JSON.parse(await readFile(path.join(scratch.directory, "child-runtime/marker.json"), "utf8"));
    assert.ok(Object.values(values).every((value) => value === scratch.directory));
  } finally { await Promise.all([scratch.close(), scratch.close()]); }
  await assert.rejects(stat(scratch.directory), { code: "ENOENT" });
  assert.deepEqual({ TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR }, original);
});

test("independent concurrent sessions clean only their owned directories", async () => {
  const a = await createOwnedRuntimeScratch("scratch-unit-"), b = await createOwnedRuntimeScratch("scratch-unit-");
  try {
    assert.notEqual(a.directory, b.directory);
    await writeFile(path.join(b.directory, "owned-marker"), "session-b");
    await a.close(); assert.equal(await readFile(path.join(b.directory, "owned-marker"), "utf8"), "session-b");
    assert.ok((await readdir(work)).includes(path.basename(b.directory)));
  } finally { await finishOwnedCleanup([() => a.close(), () => b.close()]); }
});

test("cleanup failure still attempts every independent action and remains a failure", async () => {
  const called = [];
  await assert.rejects(finishOwnedCleanup([
    () => { called.push(1); throw new Error("profile busy"); },
    async () => { called.push(2); },
    () => { called.push(3); throw new Error("scratch busy"); },
  ]), (error) => error instanceof AggregateError && error.errors.length === 2);
  assert.deepEqual(called, [1, 2, 3]);
});

test("scratch prefix cannot escape or select any pre-existing blocked target", async () => {
  for (const prefix of ["../", "update-check", "node-compile-cache", "H:/", ""]) {
    await assert.rejects(createOwnedRuntimeScratch(prefix));
  }
});
