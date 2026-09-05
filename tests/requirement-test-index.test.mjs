import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(
  await readFile(
    path.join(projectRoot, "evidence", "requirement-test-index-2026-09-05.json"),
    "utf8",
  ),
);

const requiredScenarioIds = [
  "success",
  "unsupported-combination",
  "corrupt-source",
  "cancellation-opfs",
  "cancellation-direct",
  "repeated-conversion",
  "write-failure",
  "quota",
  "permission",
  "unicode-filename",
  "larger-than-4-gib",
  "multiple-audio-tracks",
  "subtitle-tracks",
  "chapters",
  "attachments",
  "variable-frame-rate",
  "metadata",
  "batch",
  "worker-failure",
  "reload",
  "cleanup-after-failure",
];

test("T-05 requirement index names every mandated browser scenario exactly once", () => {
  assert.equal(index.requirement, "T-05");
  assert.equal(index.status, "direct coverage");
  assert.deepEqual(
    index.scenarios.map((scenario) => scenario.id).sort(),
    [...requiredScenarioIds].sort(),
  );
  assert.equal(new Set(index.scenarios.map((scenario) => scenario.id)).size, requiredScenarioIds.length);
  for (const scenario of index.scenarios) {
    assert.ok(scenario.requirement.length > 10, scenario.id);
    assert.ok(scenario.evidence.length > 0, scenario.id);
  }
});

test("every indexed source anchor and retained report exists", async () => {
  for (const scenario of index.scenarios) {
    for (const evidence of scenario.evidence) {
      const source = await readFile(path.join(projectRoot, evidence.path), "utf8");
      if (evidence.path.endsWith(".json")) JSON.parse(source);
      for (const snippet of evidence.snippets ?? []) {
        assert.ok(source.includes(snippet), `${scenario.id}: missing ${JSON.stringify(snippet)}`);
      }
    }
  }
});

test("retained reports directly prove repeatability, greater-than-4-GiB, and complex fields", async () => {
  const repeated = JSON.parse(
    await readFile(
      path.join(projectRoot, "outputs", "reports", "2026-08-28T06-45-23-327Z-mkv-to-mp4-direct-handle-stress.json"),
      "utf8",
    ),
  );
  assert.equal(repeated.passed, true);
  assert.equal(repeated.destinationMode, "direct-handle");
  assert.equal(repeated.source.bytes, index.retainedReportFacts.repeatability.sourceBytes);
  assert.equal(repeated.runs.length, index.retainedReportFacts.repeatability.runs);
  assert.equal(new Set(repeated.runs.map((run) => run.sha256)).size, 1);
  assert.ok(repeated.runs.every((run) => run.outputBytes === repeated.runs[0].outputBytes));
  assert.ok(repeated.checks.cleanupRecovery);

  const large = JSON.parse(
    await readFile(
      path.join(projectRoot, "outputs", "reports", "2026-08-13T12-44-21-282Z-mkv-to-mp4-stress.json"),
      "utf8",
    ),
  );
  assert.equal(large.passed, true);
  assert.ok(large.source.bytes >= index.retainedReportFacts.largeFile.minimumBytes);
  assert.equal(large.source.bytes, index.retainedReportFacts.largeFile.sourceBytes);
  assert.equal(large.runs[0].outputBytes, index.retainedReportFacts.largeFile.outputBytes);
  assert.equal(large.runs[0].validationBytes, large.runs[0].outputBytes);
  assert.equal(large.runs[0].validationSha256, large.runs[0].sha256);

  const complex = JSON.parse(
    await readFile(
      path.join(projectRoot, index.retainedReportFacts.complexFixture.path),
      "utf8",
    ),
  );
  assert.equal(complex.execution.result, index.retainedReportFacts.complexFixture.result);
  assert.deepEqual(
    complex.independentlyProbedMatroskaOutput.streamCodecsInOrder,
    index.retainedReportFacts.complexFixture.streamCodecsInOrder,
  );
  assert.deepEqual(
    complex.independentlyProbedMatroskaOutput.chapterTitles,
    index.retainedReportFacts.complexFixture.chapterTitles,
  );
  assert.equal(complex.cleanup.convertedOutputsRetained, 0);
});
