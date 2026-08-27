import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conversionProfiles, formats } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportRoot = path.join(projectRoot, "outputs", "reports");
const evidencePath = path.join(
  projectRoot,
  "evidence",
  "public-profile-evidence.json",
);
const requiredChecks = [
  "processTreePrivateMemory",
  "repeatableOutputHash",
  "pendingOperations",
  "queuedBytes",
  "readChunkBytes",
  "writeChunkBytes",
  "wasmMemoryBytes",
  "cleanupRecovery",
];

function reportSourceBytes(report) {
  return Math.max(
    Number(report.source?.bytes ?? 0),
    ...report.runs.map((run) => Number(run.sourceBytes ?? 0)),
  );
}

function reportIsStrictlyPassing(report) {
  if (
    report.passed !== true ||
    report.limitMiB !== 250 ||
    !Number.isFinite(report.incrementalPrivateMiB) ||
    report.incrementalPrivateMiB > 250 ||
    !Array.isArray(report.runs) ||
    report.runs.length === 0
  ) {
    return false;
  }
  if (requiredChecks.some((check) => report.checks?.[check] !== true)) {
    return false;
  }
  return report.runs.every((run) => {
    // Validators report different byte domains. Container/image validators probe
    // the output, compression validators hash the decoded source, and structured
    // converters may validate the output stream in-browser without a second
    // hash. Do not incorrectly require the validation hash to equal the encoded
    // output hash.
    // Older validated archive reports retained the complete decoded byte count
    // but not the validator's hash/probe object. A positive validation byte count
    // is the common persisted contract; category suites retain the structural or
    // content assertions themselves.
    const validationEvidence =
      Number.isFinite(run.validationBytes) && run.validationBytes > 0;
    return (
      Number.isFinite(run.sourceBytes) &&
      run.sourceBytes > 0 &&
      Number.isFinite(run.outputBytes) &&
      run.outputBytes > 0 &&
      Number.isFinite(run.incrementalPrivateMiB) &&
      run.incrementalPrivateMiB <= 250 &&
      Number.isFinite(run.peakPendingOperations) &&
      run.peakPendingOperations <= 1 &&
      typeof run.sha256 === "string" &&
      validationEvidence
    );
  });
}

const publicPassed = conversionProfiles.filter(
  (profile) => profile.public && profile.automatedTestStatus === "passed",
);
const pending = conversionProfiles.filter(
  (profile) => profile.automatedTestStatus === "pending",
);
const leaked = conversionProfiles.filter(
  (profile) =>
    profile.public && profile.automatedTestStatus !== "passed",
);
const pdfFormats = formats.filter(
  (format) =>
    format.id === "pdf" ||
    format.extensions.includes("pdf") ||
    format.mimeTypes.includes("application/pdf"),
);
const pdfProfiles = conversionProfiles.filter(
  (profile) => profile.input === "pdf" || profile.output === "pdf",
);

function auditRegistry() {
  const duplicatePublicIds = publicPassed
    .map((profile) => profile.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicatePublicIds.length > 0) {
    throw new Error(`Duplicate public profile ids: ${duplicatePublicIds.join(", ")}`);
  }
  if (pending.length > 0) {
    throw new Error(
      `Unresolved pending profiles: ${pending.map((profile) => profile.id).join(", ")}`,
    );
  }
  if (leaked.length > 0) {
    throw new Error(
      `Non-passing public profiles: ${leaked.map((profile) => profile.id).join(", ")}`,
    );
  }
  if (pdfFormats.length > 0 || pdfProfiles.length > 0) {
    throw new Error("PDF leaked into the format or conversion registry.");
  }
}

async function auditCompactManifest() {
  auditRegistry();
  const manifest = JSON.parse(await readFile(evidencePath, "utf8"));
  const entries = Array.isArray(manifest.profiles) ? manifest.profiles : [];
  if (manifest.schemaVersion !== 1 || entries.length !== publicPassed.length) {
    throw new Error(
      `Compact public evidence has ${entries.length} entries for ${publicPassed.length} profiles.`,
    );
  }
  const byId = new Map(entries.map((entry) => [entry.profileId, entry]));
  for (const profile of publicPassed) {
    const entry = byId.get(profile.id);
    if (
      !entry ||
      entry.maxTestedBytes !== profile.maxTestedBytes ||
      entry.repeatableEvidence?.runs < 3 ||
      entry.repeatableEvidence?.incrementalPrivateMiB > 250 ||
      entry.maximumSizeEvidence?.sourceBytes < profile.maxTestedBytes ||
      entry.maximumSizeEvidence?.incrementalPrivateMiB > 250 ||
      !/^[a-f0-9]{64}$/.test(entry.repeatableEvidence?.reportSha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(entry.maximumSizeEvidence?.reportSha256 ?? "")
    ) {
      throw new Error(`Compact public evidence is invalid for ${profile.id}.`);
    }
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        publicPassedProfiles: publicPassed.length,
        compactEvidenceEntries: entries.length,
        pendingProfiles: pending.length,
        publicNonPassingProfiles: leaked.length,
        pdfFormats: pdfFormats.length,
        pdfProfiles: pdfProfiles.length,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv.includes("--manifest-only")) {
  await auditCompactManifest();
  process.exit(0);
}

auditRegistry();

const malformedReports = [];
const passingReportsByProfile = new Map();
for (const name of await readdir(reportRoot)) {
  if (!name.endsWith("-stress.json")) continue;
  try {
    const raw = await readFile(path.join(reportRoot, name), "utf8");
    const report = JSON.parse(raw);
    if (!reportIsStrictlyPassing(report) || typeof report.profileId !== "string") {
      continue;
    }
    const existing = passingReportsByProfile.get(report.profileId) ?? [];
    existing.push({
      name,
      report,
      reportSha256: createHash("sha256").update(raw).digest("hex"),
    });
    passingReportsByProfile.set(report.profileId, existing);
  } catch (error) {
    malformedReports.push({ name, error: String(error) });
  }
}

if (malformedReports.length > 0) {
  throw new Error(
    `Malformed retained stress reports:\n${malformedReports
      .map(({ name, error }) => `${name}: ${error}`)
      .join("\n")}`,
  );
}

const failures = [];
const selectedEvidence = [];
for (const profile of publicPassed) {
  const reports = passingReportsByProfile.get(profile.id) ?? [];
  const byStrength = [...reports].sort(
    (left, right) =>
      right.report.runs.length - left.report.runs.length ||
      reportSourceBytes(right.report) - reportSourceBytes(left.report) ||
      right.name.localeCompare(left.name),
  );
  const repeatable = byStrength.find(({ report }) => report.runs.length >= 3);
  const testedAtPublishedMaximum = [...reports]
    .sort(
      (left, right) =>
        reportSourceBytes(right.report) - reportSourceBytes(left.report) ||
        right.name.localeCompare(left.name),
    )
    .find(({ report }) => reportSourceBytes(report) >= profile.maxTestedBytes);
  if (!repeatable || !testedAtPublishedMaximum) {
    failures.push({
      profileId: profile.id,
      maxTestedBytes: profile.maxTestedBytes,
      passingReportCount: reports.length,
      repeatableReport: repeatable?.name ?? null,
      maximumSizeReport: testedAtPublishedMaximum?.name ?? null,
      largestPassingSourceBytes: Math.max(
        0,
        ...reports.map(({ report }) => reportSourceBytes(report)),
      ),
    });
  } else {
    selectedEvidence.push({
      profileId: profile.id,
      maxTestedBytes: profile.maxTestedBytes,
      repeatableEvidence: {
        report: repeatable.name,
        reportSha256: repeatable.reportSha256,
        runs: repeatable.report.runs.length,
        sourceBytes: reportSourceBytes(repeatable.report),
        incrementalPrivateMiB: repeatable.report.incrementalPrivateMiB,
      },
      maximumSizeEvidence: {
        report: testedAtPublishedMaximum.name,
        reportSha256: testedAtPublishedMaximum.reportSha256,
        runs: testedAtPublishedMaximum.report.runs.length,
        sourceBytes: reportSourceBytes(testedAtPublishedMaximum.report),
        incrementalPrivateMiB:
          testedAtPublishedMaximum.report.incrementalPrivateMiB,
      },
    });
  }
}

if (failures.length > 0) {
  throw new Error(
    `Public evidence audit failed for ${failures.length} profiles:\n${JSON.stringify(failures, null, 2)}`,
  );
}

const compactManifest = {
  schemaVersion: 1,
  memoryFormula:
    "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
  memoryLimitMiB: 250,
  profiles: selectedEvidence.sort((left, right) =>
    left.profileId.localeCompare(right.profileId),
  ),
};
const compactJson = `${JSON.stringify(compactManifest, null, 2)}\n`;
if (process.argv.includes("--write-manifest")) {
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, compactJson, "utf8");
} else {
  const retainedCompactJson = await readFile(evidencePath, "utf8").catch(
    () => null,
  );
  if (retainedCompactJson !== compactJson) {
    throw new Error(
      "Compact public evidence is missing or stale. Run npm run evidence:public:write after validating the raw reports.",
    );
  }
}

const summary = {
  publicPassedProfiles: publicPassed.length,
  profilesWithThreeRunEvidence: publicPassed.filter((profile) =>
    passingReportsByProfile
      .get(profile.id)
      ?.some(({ report }) => report.runs.length >= 3),
  ).length,
  profilesTestedAtPublishedMaximum: publicPassed.filter((profile) =>
    passingReportsByProfile
      .get(profile.id)
      ?.some(({ report }) => reportSourceBytes(report) >= profile.maxTestedBytes),
  ).length,
  pendingProfiles: pending.length,
  publicNonPassingProfiles: leaked.length,
  pdfFormats: pdfFormats.length,
  pdfProfiles: pdfProfiles.length,
  compactEvidence: process.argv.includes("--write-manifest")
    ? "written"
    : "matched",
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
