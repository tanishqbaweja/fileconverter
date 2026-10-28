import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectWasmTrap } from "../images/resvg-source/trap-inspection.mjs";
import { addAllocationProbe } from "../images/resvg-source/allocation-probe.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
const allocationProbe = process.argv[2] === "--instrument-probe";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && allocationProbe));
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", sourcePins: {}, failures: [],
  scope: "Static instructions at the actual private SVG trap offset; no converter or Wasm execution",
  conversionOrMemoryAcceptance: false, publicEngineChanged: false, originalGoalComplete: false };
let runtime;
try {
  for (const file of ["scripts/inspect-svg-filter-trap.mjs", "images/resvg-source/trap-inspection.mjs",
    "images/resvg-source/repeated-processed-input.json", "evidence/2026-10-28-svg-primary-failure-terminal.json",
    "images/resvg-source/allocation-probe.mjs",
    "node_modules/@webassemblyjs/wasm-parser/package.json", "node_modules/@webassemblyjs/wasm-parser/lib/index.js",
    "node_modules/@webassemblyjs/wasm-parser/lib/decoder.js"]) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-10-28-svg-primary-failure-terminal.json")));
  const frame = prior.failedRun.metrics.svgRuntimeFailure.stack.split("\n").find(line => line.includes("resvg::filter::get_input"));
  const position = /wasm-function\[(\d+)\]:0x([0-9a-f]+)/.exec(frame); assert.ok(position);
  const pin = JSON.parse(await readFile(path.join(root, "images/resvg-source/repeated-processed-input.json")));
  report.input = { priorFrame: frame.trim(), artifactId: pin.artifactId, wasmSha256: pin.wasmSha256 };
  runtime = await createOwnedRuntimeScratch("svg-trap-inspection-");
  const tool = process.env.WITHIN_GH_EXECUTABLE ?? "gh";
  const result = spawnSync(tool, ["api", `repos/tanishqbaweja/fileconverter/actions/artifacts/${pin.artifactId}/zip`],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 ** 2, encoding: "buffer" });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr?.toString()); assert.equal(result.signal, null);
  assert.equal(result.stdout.length, pin.artifactBytes); assert.equal(sha(result.stdout), pin.artifactSha256);
  const members = unzipSync(result.stdout), wasm = members[pin.wasmMember];
  assert.equal(wasm.length, pin.wasmBytes); assert.equal(sha(wasm), pin.wasmSha256);
  report.inspection = inspectWasmTrap(Buffer.from(wasm), Number(position[1]), Number.parseInt(position[2], 16));
  if (allocationProbe) {
    const probed = addAllocationProbe(wasm); report.instrumentation = probed.proof;
    report.instrumentedInspection = inspectWasmTrap(probed.bytes, Number(position[1]), probed.proof.instrumentedTrapOffset);
    assert.equal(report.instrumentedInspection.branchesToTrap.length, 5);
  }
  assert.match(report.inspection.name, /get_input/);
  report.status = "inspected-exact-native-trap-offset-not-a-render-or-root-cause-proof";
} catch (error) { report.status = "failed-static-svg-trap-inspection"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    await runtime?.close(); report.ownedScratchRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
  } catch (error) { report.failures.push("Owned cleanup/source integrity: " + error); report.status = "failed-static-svg-trap-inspection"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", stamp + "-svg-static-trap.json"); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root,file), status: report.status,
    instructionCount: report.inspection?.instructionCount ?? null, allocationCalls: report.inspection?.allocationAndCopyCalls?.length ?? null,
    branchesToTrap: report.inspection?.branchesToTrap?.length ?? null, failures: report.failures }));
}
