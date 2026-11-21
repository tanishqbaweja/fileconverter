// Genuine package and independent validator; worker-only check, not Chrome.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { lstat, open, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const repo = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 2);
const disk = await statfs(repo);
assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 2);
const scratch = await createOwnedRuntimeScratch("docx-run-vertical-");
let report;
try {
  const helper = path.join(repo, "scripts/lib/docx-run-vertical-fixtures.py");
  const python = process.env.WITHIN_DOCX_FIXTURE_PYTHON ?? "python";
  const run = (action, file) => promisify(execFile)(python, ["-I", "-B", helper, action, file], {
    cwd: repo, env: scratch.env, windowsHide: true, timeout: 15000, maxBuffer: 32768 });
  const input = path.join(scratch.directory, "vertical.docx"), output = path.join(scratch.directory, "direct.html");
  const generated = JSON.parse((await run("generate", input)).stdout);
  const file = await openAsBlob(input);
  assert.ok(file.size === generated.bytes && file.size <= 131072 && generated.zipCrcAndReopenVerified);
  const bundle = await build({ absWorkingDir: repo, entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false,
    platform: "browser", format: "esm" });
  const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
  const writer = await open(output, "wx"), warn = [], writes = [], metrics = { inputBytes: 0 };
  let bytes = 0, pending = 0, peakPending = 0;
  try {
    await runDocxToHtml({ file, metrics, warn: message => warn.push(message), assertActive() {}, progress() {},
      async write(chunk) {
        assert.equal(++pending, 1);
        peakPending = Math.max(peakPending, pending);
        assert.ok(chunk.byteLength <= 65536 && bytes + chunk.byteLength <= 512 * 1024);
        assert.equal((await writer.write(chunk)).bytesWritten, chunk.byteLength);
        writes.push(chunk.byteLength); bytes += chunk.byteLength; pending--;
      },
      patch() { throw new Error("Run-format fixture does not contain table span patches"); },
    });
  } finally { await writer.close(); }
  assert.equal(metrics.inputBytes, file.size);
  assert.equal(pending, 0);
  assert.equal(Math.max(...writes), 65536);
  assert.ok(writes.length >= 3);
  assert.ok(warn.some(message => message.includes("custom raised/lowered")));
  const oracle = JSON.parse((await run("validate", output)).stdout);
  assert.equal(oracle.bytes, bytes);
  assert.equal(oracle.paragraphs, 4);
  assert.equal(oracle.segments, 14);
  const source = await readFile(output, "utf8"); // at most 512 KiB, synthetic validation fixture only
  const negatives = [];
  for (const [name, mutant] of [
    ["lost-shift", source.replace("<sub>Inherited document default</sub>", "Inherited document default")],
    ["swapped-shift", source.replace("<sup>Parent superscript</sup>", "<sub>Parent superscript</sub>")],
    ["ignored-reset", source.replace(" reset ", "<sub> reset </sub>")],
    ["lost-emphasis", source.replace("<strong><sub> child &amp; &lt; Ω</sub></strong>", "<sub> child &amp; &lt; Ω</sub>")],
    ["truncated-tail", source.replace(" Plain tail", " Plain tai")],
  ]) {
    assert.notEqual(mutant, source, name);
    const file = path.join(scratch.directory, name + ".html");
    await writeFile(file, mutant, { flag: "wx" });
    await assert.rejects(run("validate", file), error => error.code === 1 && /AssertionError/.test(error.stderr));
    negatives.push(name);
  }
  report = { fixture: { ...generated, sha256: createHash("sha256").update(await readFile(input)).digest("hex") }, oracle,
    negatives, writes, peakPending, warnings: warn, browserLaunched: false, browserQualified: false, protectedOriginalRead: false };
} finally { await scratch.close(); }
await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
console.log(JSON.stringify({ ...report, scratchRemoved: true }, null, 2));
