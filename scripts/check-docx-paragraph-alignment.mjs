// Source/worker preflight only. Does not launch a browser or save media to disk.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import "./lib/hidden-unit-subprocesses.mjs";

const path = fileURLToPath(new URL("./lib/docx-paragraph-alignment-fixture.py", import.meta.url));
const python = process.env.WITHIN_DOCX_FIXTURE_PYTHON ?? "python";
const invoke = (mode, input) => spawnSync(python, ["-B", path, mode],
  { input, windowsHide: true, maxBuffer: 262_144 });
const first = invoke("generate"), second = invoke("generate");
const sha = value => createHash("sha256").update(value).digest("hex");
for (const result of [first, second]) {
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString());
}
assert.deepEqual(first.stdout, second.stdout);
const bundle = await build({ entryPoints: ["workers/docx-html-conversion.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
const { runDocxToHtml } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
let maximumWriteBytes = 0, outputBytes = 0, pending = 0;
const chunks = [], warnings = [];
await runDocxToHtml({ file: new File([first.stdout], "alignment.docx"), metrics: {}, assertActive() {}, progress() {}, warn: warning => warnings.push(warning),
  async write(chunk) {
    assert.equal(++pending, 1);
    maximumWriteBytes = Math.max(maximumWriteBytes, chunk.byteLength);
    outputBytes += chunk.byteLength;
    assert.ok(outputBytes <= 65_536);
    chunks.push(Buffer.from(chunk));
    await new Promise(resolve => setImmediate(resolve));
    pending--;
  } });
const html = Buffer.concat(chunks);
assert.equal(warnings.filter(w => w.includes("have no equivalent")).length, 1);
const checked = invoke("verify", html);
if (checked.error) throw checked.error;
assert.equal(checked.status, 0, checked.stderr.toString());
assert.equal(Number(checked.stdout.toString().trim()), 8);
const mutants = [
  ["wrong-heading", html.toString().replace("text-align:right", "text-align:left")],
  ["dropped-direct-override", html.toString().replace(' style="text-align:justify"', "")],
  ["reordered-rtl-text", html.toString().replace("שלום 123 English", "English 123 שלום")],
  ["direction-injected", html.toString().replace("<p ", '<p dir="rtl" ')],
];
for (const [name, mutant] of mutants) {
  assert.notEqual(mutant, html.toString(), name);
  const rejected = invoke("verify", mutant);
  if (rejected.error) throw rejected.error;
  assert.equal(rejected.status, 1, name);
}
console.log(JSON.stringify({
  docxFixtureBytes: first.stdout.length, docxFixtureSha256: sha(first.stdout), repeatedFixtureBytesIdentical: true,
  outputBytes, outputSha256: sha(html), maximumWriteBytes, checkedParagraphs: 8,
  rejectedOracleMutants: mutants.map(([name]) => name),
  fixtureAndOutputInMemoryOnly: true, browserLaunched: false,
}, null, 2));
