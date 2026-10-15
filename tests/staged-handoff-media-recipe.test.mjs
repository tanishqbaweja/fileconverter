import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { HANDOFF_MEDIA_FILES, withStagedHandoffSpec, withStagedHandoffDriver } from "../scripts/lib/staged-handoff-media-recipe.mjs";
import { makeStagedHandoffMediaCaller } from "../scripts/lib/staged-handoff-media-caller.mjs";
const root = path.resolve(import.meta.dirname, "..");
const read = file => readFile(path.join(root, file), "utf8");
const reverse = recipe => recipe.edits.toReversed().reduce((source, [before, after]) => source.replace(after, before), recipe.generated);
test("handoff qualifier preserves source caps and captures all changed modules", async () => {
  const caller = makeStagedHandoffMediaCaller(await read("scripts/qualify-ebml-reuse-media.mjs"), root);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: caller.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  for (const file of HANDOFF_MEDIA_FILES) { await read(file); assert.ok(caller.generated.includes(JSON.stringify(file)), file); }
  for (const token of ["legacyFiles.length,255", "supplemental.length<=128", "raw.length<=2097152", "WITHIN_DURATION_DRAIN_CONTROL_RECEIPT"])
    assert.ok(caller.generated.includes(token), token);
  assert.ok(!caller.generated.includes("${stamp}-duration-drain-media"));
});
test("actual previous spec/driver accept only lifecycle edits with unchanged conversion gates", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-15T10-41-15-440Z-duration-drain-media.json"));
  const archive = JSON.parse(gunzipSync(await readFile(path.join(root, proof.generatedArchive.path))));
  const { spec: originalSpec, driver: originalDriver } = archive.generated;
  assert.equal(typeof originalSpec, "string"); assert.equal(typeof originalDriver, "string");
  const spec = withStagedHandoffSpec(originalSpec), driver = withStagedHandoffDriver(originalDriver, root, "2026-10-15T17-00-00-000Z");
  assert.equal(reverse(spec), originalSpec); assert.equal(reverse(driver), originalDriver);
  assert.equal(ts.createSourceFile("handoff.spec.ts", spec.generated, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: driver.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.ok(spec.generated.includes("expect(state.metrics?.peakWasmMemoryBytes).toBe(expectedMemoryBytes)"));
  assert.ok(spec.generated.includes("observedEventsNotPhysicalMemoryReleaseProof:true"));
  assert.equal(spec.generated.match(/test\(/g).length, originalSpec.match(/test\(/g).length);
  assert.ok(driver.generated.indexOf("handoffBuildStarted=true") < driver.generated.indexOf('const environment = ') + 4096);
  assert.ok(driver.generated.includes('"node_modules/vinext/dist/cli.js","build"'));
  assert.ok(driver.generated.includes("finally { if(runtime)await runtime.close(); }"));
});
