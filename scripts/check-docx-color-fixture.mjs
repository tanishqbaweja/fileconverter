// Engineering preflight only. Runs the worker parser outside Chrome and does
// not stand in for production-browser, destination, recovery or memory checks.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { DOCX_COLOR_CASES, docxColorOracleCases } from "./lib/docx-color-oracle-controls.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 2);
const runtime = await createOwnedRuntimeScratch("docx-color-preflight-");
let report;
try {
  const python = process.env.WITHIN_DOCX_FIXTURE_PYTHON ?? "python";
  const helper = path.join(root, "scripts/lib/docx-color-fixtures.py");
  const run = (...args) => execute(python, ["-I", "-B", helper, ...args], {
    cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 1048576,
  });
  const input = path.join(runtime.directory, "color.docx");
  const generated = JSON.parse((await run("generate", input)).stdout);
  assert.equal(generated.generator, "python-docx");
  assert.equal(generated.referencedThemeAndSettings, true);
  assert.equal(generated.zipCrcAndWordReopenVerified, true);
  assert.equal(generated.fixedZipTimestamps, true);
  assert.equal(generated.semanticCases, DOCX_COLOR_CASES);
  assert.ok(generated.anchorContentBytes > 2 * 65536);
  const control = [];
  for (const [name, html, accepts] of docxColorOracleCases((await run("reference")).stdout)) {
    const file = path.join(runtime.directory, name + ".html");
    await writeFile(file, html, { flag: "wx" });
    let exitCode = 0;
    try { await run("validate", file); }
    catch (error) { assert.equal(error.code, 1, error.stderr); exitCode = error.code; }
    assert.equal(exitCode === 0, accepts, name);
    control.push({ name, exitCode });
  }
  const bundle = await build({ absWorkingDir: root, entryPoints: ["workers/docx-html-conversion.ts"],
    bundle: true, write: false, format: "esm", platform: "browser" });
  const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
  const info = await lstat(input);
  assert.ok(info.isFile() && info.size > 0 && info.size <= 131072, "Bounded generated fixture only");
  const inputBytes = await readFile(input);
  const output = path.join(runtime.directory, "worker-output.html");
  const out = await open(output, "wx");
  const warnings = [], metrics = { inputBytes: 0 };
  let size = 0, pending = 0, peakPending = 0, maxChunk = 0;
  try {
    await runDocxToHtml({ file: new File([inputBytes], "color.docx"), metrics, warn: w => warnings.push(w), assertActive() {}, progress() {},
      async write(chunk) {
        assert.equal(++pending, 1);
        peakPending = Math.max(peakPending, pending);
        assert.ok(chunk.length <= 65536 && size + chunk.length <= 1048576);
        maxChunk = Math.max(maxChunk, chunk.length);
        const { bytesWritten } = await out.write(chunk); assert.equal(bytesWritten, chunk.length);
        size += bytesWritten; pending--;
      },
    });
  } finally { await out.close(); }
  const validated = JSON.parse((await run("validate", output)).stdout);
  assert.equal(validated.bytes, size);
  assert.equal(validated.allRunTextColorAndEmphasisVerified, true);
  assert.equal(validated.semanticCases, DOCX_COLOR_CASES);
  assert.equal(metrics.inputBytes, inputBytes.length);
  assert.equal(maxChunk, 65536); assert.equal(peakPending, 1); assert.equal(pending, 0);
  assert.equal(warnings.filter(w => w.startsWith("A DOCX text theme color could not be resolved")).length, 1);
  report = { generated, fixture: { bytes: inputBytes.length, sha256: createHash("sha256").update(inputBytes).digest("hex") },
    validated, control, maxChunk, peakPending, browserLaunched: false, browserQualified: false };
} finally { await runtime.close(); }
await assert.rejects(lstat(runtime.directory), { code: "ENOENT" });
console.log(JSON.stringify({ ...report, ownedScratchRemoved: true }));
