import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { rawInput, bindgenTool, experimentalMaximumBytes, verifySourceReceipt, requireArtifactMembers, compareStaticAbi } from "../images/resvg-source/postprocess-contract.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
test("actual third compile succeeded with exact command, repaired lock, genuine raw Wasm digest and owned cleanup", async () => {
  const terminal = await json("evidence/2026-10-27-svg-bytes-compile-terminal.json");
  assert.equal(terminal.conclusion, "success"); assert.equal(terminal.realSourceCompilationSucceeded, true);
  assert.equal(terminal.bindgenProcessingOrRenderingExecuted, false); assert.equal(terminal.originalGoalComplete, false);
  const receipt = verifySourceReceipt(await read(terminal.rawReceipt));
  const archive = await json(terminal.executedWorkflowArchive); assert.equal(archive.sourceCommit, rawInput.headSha);
  for (const [file, digest] of Object.entries(receipt.sourcePins)) {
    const old = archive.files[file]; let bytes;
    if (old) { bytes = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 });
      assert.equal(bytes.length, old.bytes); assert.equal(sha(bytes), old.sha256); }
    else bytes = await read(file);
    assert.equal(sha(bytes), digest, `Actual successful compiler source: ${file}`);
  }
  assert.equal(receipt.rawWasm.executed, false); assert.equal(receipt.rawWasm.importCount, 21); assert.equal(receipt.rawWasm.exportCount, 799);
  const corrupted = Buffer.from(await read(terminal.rawReceipt)); corrupted[0] ^= 1;
  assert.throws(() => verifySourceReceipt(corrupted));
});
test("raw artifact allowlist rejects duplicate, missing, additional and path-bearing entries", () => {
  const names = [rawInput.receiptMember, rawInput.lockMember, rawInput.wasmMember]; requireArtifactMembers(names);
  for (const invalid of [names.slice(1), [...names, names[0]], [...names, "extra"], names.map(name => "../" + name)])
    assert.throws(() => requireArtifactMembers(invalid));
  assert.match(rawInput.artifactSha256, /^[a-f0-9]{64}$/); assert.equal(rawInput.artifactBytes, 1259721);
});
test("static ABI names/kinds comparison never claims function-signature, rendering or runtime acceptance", async () => {
  const published = await read("public/engines/svg/resvg.wasm"), same = compareStaticAbi(published, published);
  assert.equal(same.namesAndKindsEqual, true); assert.equal(same.instantiated, false);
  assert.equal(same.functionSignaturesOrRuntimeCompatibilityProven, false);
  const empty = Buffer.from([0,97,115,109,1,0,0,0]), different = compareStaticAbi(published, empty);
  assert.equal(different.namesAndKindsEqual, false); assert.ok(different.missingExports.length > 0);
  assert.throws(() => compareStaticAbi(published, Buffer.from("invalid")));
});
test("pinned postprocessor scope does not compile sources, install dependencies, convert user files or select normal CI gates", async () => {
  assert.equal(bindgenTool.version, "0.2.92"); assert.equal(experimentalMaximumBytes, 96 * 1024 ** 2);
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const workflow = yaml.load((await read(".github/workflows/ci.yml")).toString()), jobs = workflow.jobs;
  assert.ok(workflow.on.workflow_dispatch.inputs.engine.options.includes("svg-source-postprocess"));
  assert.match(jobs["engine-matrix"].if, /inputs.engine != 'svg-source-postprocess'/);
  for (const id of ["verify", "browser-conversions", "svg-source-lock", "svg-source-compile", "svg-source-compile-pathfinder", "svg-source-compile-bytes"])
    assert.doesNotMatch(jobs[id].if, /svg-source-postprocess/);
  const job = jobs["svg-source-postprocess"]; assert.equal(job["timeout-minutes"], 10); assert.equal(job.permissions.actions, "read");
  assert.equal(job.if, "github.event_name == 'workflow_dispatch' && inputs.engine == 'svg-source-postprocess'");
  assert.equal(job.steps.find(row => row.run?.startsWith("node ")).run, "node images/resvg-source/postprocess-candidate.mjs");
  const source = (await read("images/resvg-source/postprocess-candidate.mjs")).toString();
  assert.match(source, /windowsHide: true/); assert.match(source, /await runtime\?\.close\(\)/);
  assert.doesNotMatch(source, /(?:npm ci|cargo build|WebAssembly\.instantiate|public\/engines\/svg.*writeFile)/);
});
