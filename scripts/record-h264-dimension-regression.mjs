import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reports = [];
for (const relative of process.argv.slice(2)) {
  assert.match(relative, /^outputs\/reports\/[^/]+-h264-dimension-guard\.json$/);
  const bytes = await readFile(path.join(root, relative)), report = JSON.parse(bytes);
  assert.equal(report.publicProfilesChanged, false);
  assert.equal(report.cleanup.ownedFixtureOutputsProfileAndTempRemoved, true);
  reports.push({ rawReport: relative, rawReportSha256: createHash("sha256").update(bytes).digest("hex"), report });
}
assert.ok(reports.some(({ report }) => report.state?.jobState === "complete"));
assert.ok(!(await readdir(path.join(root, "work"))).some((name) => name.startsWith("h264-dimension-")));
await assert.rejects(stat(path.join(root, "dist/client/engines/remux/_candidate_h264_base.mjs")), { code: "ENOENT" });
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04", status: "confirmed-silent-dynamic-resize-with-source-fix-pending-build",
  reports, currentKernelSha256: createHash("sha256").update(await readFile(path.join(root, "media/ffmpeg/h264-candidate.c"))).digest("hex"),
  fix: "Compare every frame against immutable source dimensions captured after decoder open, not a decoder context that updates after new headers; reject explicitly before scaler/encoder.",
  fixedBinaryValidated: false, publicAcceptance: false, primaryIncrementalPrivateMiB: null,
  limits: ["Focused small safety regression, not a memory, speed or scaling certification.", "Old as-built kernel hashes and failed browser findings remain unchanged."] };
await writeFile(path.join(root, "evidence/h264-dimension-regression-2026-10-04.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
