// Matched worker conversion benchmark, outside Chrome. No user inputs or disk outputs.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, "..");
const baselineHead = "eac518f1ad88dc51214971ebfdc50441bc0c7b3b";
const source = "workers/docx-html-conversion.ts";
const run = promisify(execFile);
const sha = value => createHash("sha256").update(value).digest("hex");
const archived = (await run("git", ["show", `${baselineHead}:${source}`],
  { cwd: root, windowsHide: true, maxBuffer: 1_048_576 })).stdout;
const candidate = await readFile(path.join(root, source), "utf8");
assert.notEqual(sha(archived), sha(candidate));
const compile = async (contents) => {
  const bundled = await build({ stdin: { contents, resolveDir: path.join(root, "workers"), sourcefile: source, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "browser" });
  return (await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64"))).runDocxToHtml;
};
const [old, next] = await Promise.all([compile(archived), compile(candidate)]);
function makeWordPackage(body) {
  const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  return zipSync({
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`),
  }, { level: 0, mtime: new Date("2000-01-01T00:00:00Z") });
}

async function measure(convert, file) {
  const output = createHash("sha256"), layout = createHash("sha256"), warnings = [];
  let size = 0, writes = 0, maxWrite = 0, pending = 0, peakPending = 0;
  const metrics = {};
  await convert({ file, metrics, assertActive() {}, progress() {}, warn: text => warnings.push(text),
    async write(chunk) {
      peakPending = Math.max(++pending, peakPending);
      assert.equal(pending, 1);
      assert.ok(chunk.length > 0 && chunk.length <= 65536);
      maxWrite = Math.max(maxWrite, chunk.length);
      size += chunk.length;
      writes += 1;
      assert.ok(size <= 8 * 1024 ** 2);
      output.update(chunk);
      layout.update(chunk.length + "\n");
      await new Promise(resolve => setImmediate(resolve));
      pending--;
    },
  });
  assert.equal(pending, 0);
  assert.equal(metrics.inputBytes, file.size);
  return { digest: output.digest("hex"), size, writes, maxWrite, peakPending, writeSizesDigest: layout.digest("hex"),
    warningsDigest: sha(JSON.stringify(warnings)) };
}

async function observeEncoding(convert, file) {
  const native = globalThis.TextEncoder;
  const allocations = { encodeCalls: 0, encodedArrayBytes: 0, encodeIntoCalls: 0 };
  globalThis.TextEncoder = class extends native {
    encode(value) {
      const bytes = super.encode(value);
      allocations.encodeCalls++;
      allocations.encodedArrayBytes += bytes.byteLength;
      return bytes;
    }
    encodeInto(value, destination) {
      allocations.encodeIntoCalls++;
      return super.encodeInto(value, destination);
    }
  };
  try { return { result: await measure(convert, file), allocations }; }
  finally { globalThis.TextEncoder = native; }
}

const runtime = await createOwnedRuntimeScratch("docx-html-encode-bench-");
const output = [];
const sampleCount = 12;
const warmupPairs = 2;
try {
  const fixture = path.join(runtime.directory, "native-combined.docx");
  await run(process.env.WITHIN_DOCX_FIXTURE_PYTHON ?? "python",
    ["-I", "-B", path.join(root, "scripts/lib/docx-color-fixtures.py"), "generate", fixture, "--paragraph-alignment"],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 15_000, maxBuffer: 32_768 });
  const stat = await lstat(fixture);
  assert.ok(stat.isFile() && stat.size <= 131_072);
  const formats = [
    ["genuine-python-docx-combined", await readFile(fixture)],
    ["many-short-styled-paragraphs", makeWordPackage(
      '<w:p><w:r><w:rPr><w:b/><w:color w:val="7F3042"/></w:rPr><w:t>α &amp; 😀</w:t></w:r><w:r><w:t>One &lt;two&gt;</w:t></w:r></w:p>'.repeat(8000))],
    ["long-unicode-and-escaped-text", makeWordPackage(
      '<w:p><w:r><w:t>' + 'Long text 世界 😀 &amp; &lt;test&gt; '.repeat(70_000) + '</w:t></w:r></w:p>')],
  ];
  for (const [name, bytes] of formats) {
    const file = new File([bytes], name + ".docx");
    const baseline = await observeEncoding(old, file), updated = await observeEncoding(next, file);
    assert.deepEqual(updated.result, baseline.result, name);
    for (let i = 0; i < warmupPairs; i++) {
      await measure(old, file); await measure(next, file);
    }
    const measurementsMs = { baseline: [], candidate: [] };
    for (let i = 0; i < sampleCount; i++) {
      for (const label of i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
        const start = performance.now();
        const proof = await measure(label === "baseline" ? old : next, file);
        measurementsMs[label].push(performance.now() - start);
        assert.deepEqual(proof, baseline.result, label);
      }
    }
    const stats = Object.fromEntries(Object.entries(measurementsMs).map(([key, values]) => {
      const ascending = values.toSorted((a, b) => a - b);
      const middle = ascending.length / 2;
      return [key, { medianMs: (ascending[middle - 1] + ascending[middle]) / 2,
        p90Ms: ascending[Math.ceil(ascending.length * 0.9) - 1], rawMs: values }];
    }));
    output.push({ name, bytes: file.size, sha256: sha(bytes), result: baseline.result,
      encodingAllocations: { baseline: baseline.allocations, candidate: updated.allocations }, stats });
  }
} finally { await runtime.close(); }
await assert.rejects(lstat(runtime.directory), { code: "ENOENT" });
console.log(JSON.stringify({ scope: "identical Node worker conversion and in-process sink; not browser IO or memory acceptance",
  node: process.version, platform: process.platform, arch: process.arch,
  baselineHead, baselineSha256: sha(archived), candidateSha256: sha(candidate),
  sampleCount, warmupPairs, output, ownedScratchRemoved: true, browserLaunched: false,
}, null, 2));
