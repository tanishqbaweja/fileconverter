import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reports = ["2026-10-03T21-05-15-113Z", "2026-10-03T21-06-17-694Z",
  "2026-10-03T21-10-46-130Z", "2026-10-03T21-15-43-196Z"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const attempts = [];
let commonSource, commonManifest;
for (const stamp of reports) {
  const relative = `outputs/reports/${stamp}-private-h264-720p-memory.json`;
  const bytes = await readFile(path.join(root, relative)), report = JSON.parse(bytes);
  assert.equal(report.status, "failed");
  assert.equal(report.primaryLimitMiB, 250);
  assert.equal(report.publicProfilesChanged, false);
  assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
  if (!commonSource) { commonSource = report.source; commonManifest = report.asBuiltManifest; }
  assert.equal(report.source.sha256, commonSource.sha256);
  assert.deepEqual(report.asBuiltManifest.artifacts, commonManifest.artifacts);
  // All native/browser/OS evidence is preserved. Only identical source facts
  // and as-built manifests are deduplicated across attempts.
  const { source, asBuiltManifest, ...attempt } = report;
  assert.ok(source && asBuiltManifest);
  attempts.push({ report: relative, rawReportSha256: sha(bytes), ...attempt });
}
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04",
  status: "private-h264-720p-memory-rejected-no-public-profile",
  scope: "Actual 105 MB 720p browser encodes; not multi-gigabyte acceptance or an accepted speed optimization",
  source: commonSource, asBuiltManifest: commonManifest, attempts,
  finding: "Synchronous slices exceeded the primary cap. One BYOB run measured below it but failed its request guard; a fresh BYOB repeat exceeded it. No candidate is accepted.",
  nextInvestigation: "Accessible worker allocation diagnostics and lower fixed native-memory configuration; preserve identical fixture, output quality/timing and <=250 MiB complete-tree formula",
  cleanup: { convertedMediaAndGeneratedFixtureCopiesRetained: 0, temporaryProfilesRetained: 0,
    publicAssetsUnchanged: true, staticPrivateToolRetainedBytes: 8294487,
    compactReportsAndFailureTracesRetained: true },
};
const output = path.join(root, "evidence/h264-private-memory-2026-10-04.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);
