import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSameMkvNativeBuild, protectedRepeatReference, readProtectedRepeatReference, summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";

test("Protected repeats bind to validated whole-output bytes even after an exact build gets a new ZIP", async () => {
  const bytes = await readFile(new URL(`../${protectedRepeatReference.file}`, import.meta.url));
  const report = JSON.parse(bytes), before = report.candidateBuild;
  const after = { ...before, artifact: { id: 42, digest: "sha256:" + "e".repeat(64), bytes: 12345 } };
  assertSameMkvNativeBuild(before, after);
  const reference = readProtectedRepeatReference(bytes, after);
  assert.equal(reference.outputBytes, 2962151594);
  assert.equal(reference.outputSha256, "247c77c371340f8bfb090dc8f8cfde22d83ca1e83483672847013527c50d937b");
  assert.equal(reference.fullVideoDecode, false);
  assert.throws(() => readProtectedRepeatReference(Buffer.concat([bytes, Buffer.from("\n")]), after));
  const changed = structuredClone(after);
  changed.build.artifacts["within-direct.wasm"].sha256 = "f".repeat(64);
  assert.throws(() => readProtectedRepeatReference(bytes, changed), /Exact native build/);
});

const sample = (ms, privateBytes) => ({ timestamp: new Date(ms).toISOString(), privateBytes,
  processes: privateBytes === null ? null : [{ privateBytes }] });

test("Each protected job uses its original blank baseline and only its own conversion window", () => {
  const mib = 1048576, blank = 100 * mib;
  const rows = [sample(100, 270 * mib), sample(150, null), sample(200, 290 * mib),
    sample(300, 900 * mib), sample(400, 310 * mib), sample(500, 320 * mib)];
  const first = summarizeProtectedWindow(rows, { start: 100, end: 200 }, blank);
  const second = summarizeProtectedWindow(rows, { start: 400, end: 500 }, blank);
  assert.equal(first.incrementalPrivateMiB, 190);
  assert.equal(first.validSamples, 2); assert.equal(first.unavailableSamples, 1);
  assert.equal(second.incrementalPrivateMiB, 220);
  assert.throws(() => summarizeProtectedWindow(rows, { start: 100, end: 500 }, blank), /250 MiB/);
  assert.throws(() => summarizeProtectedWindow(rows, { start: 150, end: 150 }, blank), /no valid/);
  const altered = [sample(100, 290 * mib)]; altered[0].processes[0].privateBytes--;
  assert.throws(() => summarizeProtectedWindow(altered, { start: 100, end: 100 }, blank));
});
