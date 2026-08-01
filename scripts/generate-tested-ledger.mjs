import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  conversionProfiles,
  formatById,
} from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportRoot = path.join(projectRoot, "outputs", "reports");
const ledgerPath = path.join(projectRoot, "TESTED.md");

const publicPassed = conversionProfiles.filter(
  (profile) =>
    profile.public && profile.automatedTestStatus === "passed",
);
const reports = new Map();
const failedReports = [];

for (const name of await readdir(reportRoot).catch(() => [])) {
  if (!name.endsWith(".json")) continue;
  try {
    const report = JSON.parse(
      await readFile(path.join(reportRoot, name), "utf8"),
    );
    if (name.endsWith("-stress-failure.json") && report.failure) {
      failedReports.push(report);
      continue;
    }
    if (!name.endsWith("-stress.json")) continue;
    if (!report.passed || !report.profileId || !Array.isArray(report.runs)) {
      continue;
    }
    const current = reports.get(report.profileId);
    if (
      !current ||
      report.runs.length > current.runs.length ||
      (report.runs.length === current.runs.length &&
        String(report.generatedAt) > String(current.generatedAt))
    ) {
      reports.set(report.profileId, report);
    }
  } catch {
    // A malformed or partial report is not accepted as evidence.
  }
}

const profiled = publicPassed
  .filter((profile) => reports.has(profile.id))
  .sort((left, right) => left.id.localeCompare(right.id));

const lines = [
  "# Tested conversion ledger",
  "",
  `Updated ${new Date().toISOString().slice(0, 10)} from the capability registry and retained successful Chrome stress reports.`,
  "",
  "This is the living progress record. It is regenerated after each test/profile cycle so completed work is not repeated or inferred from memory.",
  "",
  "## What the labels mean",
  "",
  "- **Public passed**: implemented, small production-browser correctness tested, independently validated, cleanup tested, and accepted by the registry.",
  "- **Chrome stress report**: a retained full Chromium process-tree measurement using a real project-local source. Three-run evidence is preferred when multiple reports exist.",
  "- **Not claimed**: formats and features still absent remain listed at the end of this file; passing one route never implies every codec/container combination.",
  "",
  "## Current totals",
  "",
  `- Public passed conversion profiles: **${publicPassed.length}**`,
  `- Public profiles with a retained successful Chrome stress report: **${profiled.length}**`,
  "- PDF profiles: **0** (intentionally prohibited)",
  "",
  "## Retained Chrome stress evidence",
  "",
  "| Profile | Source bytes | Runs | Output bytes | Conversion time | Worst incremental private memory | Peak Wasm | I/O bounds | Cleanup |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
];

for (const profile of profiled) {
  const report = reports.get(profile.id);
  const elapsed = report.runs.map((run) => run.elapsedMs / 1000);
  const outputs = report.runs.map((run) => run.outputBytes);
  const peakWasm = Math.max(
    ...report.runs.map((run) => run.peakWasmMemoryBytes ?? 0),
  );
  const maxRead = Math.max(...report.runs.map((run) => run.maxReadChunkBytes));
  const maxWrite = Math.max(...report.runs.map((run) => run.maxWriteChunkBytes));
  lines.push(
    `| ${cell(profile.id)} | ${integer(report.source.bytes)} | ${report.runs.length} | ${range(outputs, integer)} | ${range(elapsed, seconds)} | ${report.incrementalPrivateMiB.toFixed(1)} MiB | ${mib(peakWasm)} | read ${integer(maxRead)} B / write ${integer(maxWrite)} B | ${report.checks?.cleanupRecovery ? "passed" : "not proven"} |`,
  );
}

lines.push(
  "",
  "## Retained failure evidence",
  "",
  "These are historical failed attempts retained for diagnosis. A later passing report does not erase the failure or its measured boundary.",
  "",
  "| When | Profile | Source bytes | Completed runs | Last input bytes | Failure |",
  "| --- | --- | ---: | ---: | ---: | --- |",
);

for (const report of failedReports.sort((left, right) =>
  String(left.generatedAt).localeCompare(String(right.generatedAt)),
)) {
  lines.push(
    `| ${cell(report.generatedAt ?? "unknown")} | ${cell(report.profileId ?? "unknown")} | ${integer(report.source?.bytes ?? 0)} | ${integer(report.completedRuns?.length ?? 0)} | ${integer(report.lastObservedState?.metrics?.inputBytes ?? 0)} | ${cell(String(report.failure?.message ?? report.lastObservedState?.error ?? "unknown failure").slice(0, 180))} |`,
  );
}

lines.push(
  "",
  "## Every public passed profile",
  "",
  "| Profile | Input category | Engine | Method | Largest tested source | Evidence snapshot |",
  "| --- | --- | --- | --- | ---: | --- |",
);

for (const profile of [...publicPassed].sort((left, right) =>
  left.id.localeCompare(right.id),
)) {
  const input = formatById(profile.input);
  const report = reports.get(profile.id);
  const evidence = report
    ? `${report.runs.length}-run Chrome report`
    : "registry passed; stress report not retained locally";
  lines.push(
    `| ${cell(profile.id)} | ${cell(input?.category ?? "unknown")} | ${cell(profile.engine)} | ${cell(profile.route)} | ${profile.maxTestedBytes == null ? "not recorded" : integer(profile.maxTestedBytes)} B | ${evidence} |`,
  );
}

lines.push(
  "",
  "## Explicit remaining gaps — not tested or advertised",
  "",
  "This project is not complete yet. The specification still names major surfaces that are not in the public registry, including:",
  "",
  "- Video/container: additional elementary-stream inputs/outputs; broader OGV, 3GP, and AVI codec combinations plus VP9, AV1, MPEG-2 container/audio combinations, and additional codec conversions.",
  "- Audio: AMR-WB and 3GP-contained AMR; broader AAC/ALAC/WMA variants plus user-selectable bitrate, sample-rate, channel-layout, and artwork/tag handling.",
  "- Images: HEIF/HEIC, JPEG XL, SVG rasterization, animated WebP/AVIF, and camera raw formats; broader TIFF layouts beyond the bounded scanline profile remain absent.",
  "- Archives/compression: TAR-to-7Z and additional entry-level conversion among 7Z, XZ/TAR.XZ, BZIP2/TAR.BZ2, ZIP, and TAR.GZ where safe bounded routes are added.",
  "- Product validation: broader headed-browser/manual interaction evidence, more direct-destination profiles, and continued multi-gigabyte scaling coverage for newly added media routes.",
  "",
  "## Cleanup invariant",
  "",
  "Stress generators write only under `fixtures/stress`, browser copies stay under project-owned test/profile locations, and category runners invoke cleanup in `finally`. The protected root `test.mkv` is never deleted or modified.",
  "",
  "Regenerate this ledger with `npm run tested:ledger` after new evidence is produced.",
  "",
);

await writeFile(ledgerPath, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${ledgerPath}\n`);

function cell(value) {
  return String(value).replaceAll("|", "\\|");
}

function integer(value) {
  return Math.round(Number(value)).toLocaleString("en-US");
}

function seconds(value) {
  return `${Number(value).toFixed(2)} s`;
}

function mib(value) {
  return `${(Number(value) / 1024 / 1024).toFixed(1)} MiB`;
}

function range(values, format) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum
    ? format(minimum)
    : `${format(minimum)}–${format(maximum)}`;
}
