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

for (const name of await readdir(reportRoot).catch(() => [])) {
  if (!name.endsWith("-stress.json") || name.includes("failure")) continue;
  try {
    const report = JSON.parse(
      await readFile(path.join(reportRoot, name), "utf8"),
    );
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
  "- Video/container: AVI, 3GP, OGV, and relevant elementary-stream inputs/outputs; broader VP9, AV1, MPEG-2, Theora, and codec-conversion combinations.",
  "- Audio: raw AAC, ALAC, AMR, and WMA routes; user-selectable bitrate, sample-rate, channel-layout, and artwork/tag handling.",
  "- Images: TIFF, HEIF/HEIC, JPEG XL, SVG rasterization, animated WebP/AVIF, and camera raw formats.",
  "- Archives/compression: BZIP2, XZ, and 7Z.",
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
