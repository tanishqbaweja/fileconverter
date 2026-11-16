// One explicit EMPTY scratch recovery after a preflight refusal. No recursive
// removal, browser/process cleanup, protected media access or historical rewrite.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), file = "evidence/2026-11-16T00-33-21-046Z-normal-blank-large-child.json";
const bytes = await readFile(path.join(root, file)), r = JSON.parse(bytes);
assert.equal(r.hostPreflight.safeToStart, false); assert.equal(r.archive.records, 0);
assert.equal(r.identity, undefined); assert.equal(r.browser, undefined); assert.equal(r.conversionsPerformed, 0);
const directory = path.join(root, "work/normal-blank-child-aFxRKS");
assert.equal(await realpath(directory), directory); assert.equal(path.dirname(directory), await realpath(path.join(root, "work")));
const before = await lstat(directory, { bigint: true }); assert.ok(before.isDirectory() && !before.isSymbolicLink());
assert.ok(Math.abs(Number(before.birthtimeNs / 1000000n) - Date.parse(r.hostPreflight.acquiredAt)) <= 2000);
assert.deepEqual(await readdir(directory), []);
const after = await lstat(directory, { bigint: true });
for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(after[key], before[key]);
await rmdir(directory); // refuses if any entry appeared; NEVER recursive
await assert.rejects(lstat(directory), { code: "ENOENT" });
assert.deepEqual(await readFile(path.join(root, file)), bytes);
const report = { scope: "explicit-empty-held-blank-scratch-recovery", priorReceipt: file,
  priorSha256: createHash("sha256").update(bytes).digest("hex"), target: path.relative(root, directory).replaceAll(path.sep, "/"),
  identity: { dev: String(before.dev), ino: String(before.ino), birthtimeNs: String(before.birthtimeNs) },
  emptyDirectoryRemoved: true, recursiveDeletion: false, processesKilled: false, mediaFilesRemoved: false, priorReceiptUnchanged: true };
const output = "evidence/2026-11-16-held-blank-empty-scratch-recovery.json";
await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(output);
