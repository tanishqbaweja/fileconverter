import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const evidence = JSON.parse(await readFile(new URL("../evidence/h264-dimension-regression-2026-10-04.json", import.meta.url)));
test("production browser proves silent dimension normalization in the older private kernel", () => {
  const report = evidence.reports.find(({ report }) => report.state?.jobState === "complete").report;
  assert.equal(report.source.fullDecodePassed, true);
  assert.equal(report.source.frames.length, 48);
  assert.deepEqual([...new Set(report.source.frames.map((frame) => `${frame.width}x${frame.height}`))], ["320x240", "640x360"]);
  assert.equal(report.outputEvidence.frames.length, 48);
  assert.deepEqual([...new Set(report.outputEvidence.frames.map((frame) => `${frame.width}x${frame.height}`))], ["320x240"]);
  assert.equal(report.outputEvidence.fullDecodePassed, true);
  assert.deepEqual(report.state.warnings, []);
  assert.equal(report.asBuiltManifest.candidateKernelSha256, "e9b45d17c9c95475c0d1900c25e5d2af9a32bfe9f460876e0fe7da59aa548061");
  assert.equal(report.primaryIncrementalPrivateMiB, null);
  assert.equal(evidence.fixedBinaryValidated, false);
  assert.equal(evidence.publicAcceptance, false);
  assert.ok(evidence.reports.every(({ report }) => report.cleanup.ownedFixtureOutputsProfileAndTempRemoved));
});
test("immutable-dimension source fix is recorded separately from historical binary failures", async () => {
  const bytes = await readFile(new URL("../media/ffmpeg/h264-candidate.c", import.meta.url));
  const historical = execFileSync("git", ["show", "af4ee8fa010fbf70f8b9da290c2380d7dc0b265d:media/ffmpeg/h264-candidate.c"],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), windowsHide: true });
  assert.equal(createHash("sha256").update(historical).digest("hex"), evidence.currentKernelSha256);
  const source = bytes.toString();
  assert.match(source, /frame->width != p->source_width/);
  assert.match(source, /frame->height != p->source_height/);
  assert.match(source, /source dimensions changed; refusing undisclosed resizing/);
  assert.equal((source.match(/p.source_width =/g) ?? []).length, 1);
  assert.equal((source.match(/p.source_height =/g) ?? []).length, 1);
});
