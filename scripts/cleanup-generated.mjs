import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.resolve(projectRoot, "work");
const outputsRoot = path.resolve(projectRoot, "outputs");
const reportRoot = path.resolve(outputsRoot, "reports");
const disposableOutputRoot = path.resolve(projectRoot, "output");
const playwrightOutputRoot = path.resolve(disposableOutputRoot, "playwright");
const playwrightCliRoot = path.resolve(projectRoot, ".playwright-cli");
const playwrightImageProfileRoot = path.resolve(
  workRoot,
  "playwright-profile-images",
);
const playwrightMediaProfileRoot = path.resolve(
  workRoot,
  "playwright-profile-media",
);
const playwrightPrivacyProfileRoot = path.resolve(
  workRoot,
  "playwright-profile-privacy",
);
const playwrightSmallProfileRoot = path.resolve(
  workRoot,
  "playwright-profile-small",
);
const browserImageSmokeRoot = path.resolve(
  outputsRoot,
  "browser-image-smoke",
);
const browserMediaSmokeRoot = path.resolve(
  outputsRoot,
  "browser-media-smoke",
);
const stressFixturesRoot = path.resolve(projectRoot, "fixtures", "stress");
const profileRoot = path.resolve(workRoot, "memory-profile-chrome");
const cancellationFixture = path.resolve(
  workRoot,
  "cancellation-source.ndjson",
);
const webmBenchmarkFixture = path.resolve(
  stressFixturesRoot,
  "media",
  "webm-benchmark-120s.mkv",
);
const downloadedFfmpegArchive = path.resolve(workRoot, "ffmpeg-8.1.2.tar.xz");
const detachedProfileLogs = [
  path.resolve(workRoot, "webm-profile-run.stdout.log"),
  path.resolve(workRoot, "webm-profile-run.stderr.log"),
];
const headedBrowserLogs = [
  path.resolve(workRoot, "headed-server.stdout.log"),
  path.resolve(workRoot, "headed-server.stderr.log"),
];
const retainedOutputExtensions = new Set([".json", ".csv", ".html"]);
const generatedStressExtensions = new Set([
  ".bin",
  ".gz",
  ".mkv",
  ".m4a",
  ".mp3",
  ".flac",
  ".aiff",
  ".ogg",
  ".ogv",
  ".opus",
  ".mp4",
  ".mov",
  ".3gp",
  ".ts",
  ".m2ts",
  ".m2v",
  ".mpegts",
  ".flv",
  ".avi",
  ".webm",
  ".wav",
  ".csv",
  ".tsv",
  ".ndjson",
  ".srt",
  ".vtt",
  ".ass",
  ".ttml",
  ".txt",
  ".md",
  ".html",
  ".xml",
  ".docx",
  ".xlsx",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".epub",
  ".tar",
  ".zip",
]);
const generatedStressNames = new Set(["records-128m.json"]);

assertInside(workRoot, profileRoot);
assertInside(workRoot, cancellationFixture);
assertInside(workRoot, downloadedFfmpegArchive);
assertInside(stressFixturesRoot, webmBenchmarkFixture);
for (const logPath of detachedProfileLogs) assertInside(workRoot, logPath);
for (const logPath of headedBrowserLogs) assertInside(workRoot, logPath);
assertInside(projectRoot, playwrightCliRoot);
assertInside(disposableOutputRoot, playwrightOutputRoot);
assertInside(workRoot, playwrightImageProfileRoot);
assertInside(workRoot, playwrightMediaProfileRoot);
assertInside(workRoot, playwrightPrivacyProfileRoot);
assertInside(workRoot, playwrightSmallProfileRoot);
assertInside(outputsRoot, browserImageSmokeRoot);
assertInside(outputsRoot, browserMediaSmokeRoot);
assertInside(outputsRoot, reportRoot);

if (process.argv.includes("--test-artifacts-only")) {
  await removeWithRetries(playwrightCliRoot);
  await removeWithRetries(playwrightOutputRoot);
  await removeWithRetries(playwrightImageProfileRoot);
  await removeWithRetries(playwrightMediaProfileRoot);
  await removeWithRetries(playwrightPrivacyProfileRoot);
  await removeWithRetries(playwrightSmallProfileRoot);
  await removeWithRetries(browserImageSmokeRoot);
  await removeWithRetries(browserMediaSmokeRoot);
  await rm(cancellationFixture, { force: true });
  for (const logPath of headedBrowserLogs) await rm(logPath, { force: true });
  process.stdout.write("Disposable browser test artifacts removed.\n");
  process.exit(0);
}

if (process.argv.includes("--benchmark-artifacts-only")) {
  await removeWithRetries(profileRoot);
  await rm(webmBenchmarkFixture, { force: true });
  process.stdout.write("Disposable benchmark fixture and browser profile removed.\n");
  process.exit(0);
}

if (process.argv.includes("--prune-reports-only")) {
  const removed = await pruneSupersededReports(reportRoot);
  process.stdout.write(`Removed ${removed} superseded report files.\n`);
  process.exit(0);
}

await removeWithRetries(profileRoot);
await removeWithRetries(playwrightCliRoot);
await removeWithRetries(playwrightOutputRoot);
await removeWithRetries(playwrightImageProfileRoot);
await removeWithRetries(playwrightMediaProfileRoot);
await removeWithRetries(playwrightPrivacyProfileRoot);
await removeWithRetries(playwrightSmallProfileRoot);
await removeWithRetries(browserImageSmokeRoot);
await removeWithRetries(browserMediaSmokeRoot);
await rm(cancellationFixture, { force: true });
await rm(downloadedFfmpegArchive, { force: true });
for (const logPath of detachedProfileLogs) await rm(logPath, { force: true });
for (const logPath of headedBrowserLogs) await rm(logPath, { force: true });

for await (const entry of walkFiles(outputsRoot)) {
  if (
    entry.name !== ".gitkeep" &&
    !retainedOutputExtensions.has(path.extname(entry.name).toLowerCase())
  ) {
    assertInside(outputsRoot, entry.fullPath);
    await rm(entry.fullPath, { force: true });
  }
}

for await (const entry of walkFiles(stressFixturesRoot)) {
  if (
    generatedStressExtensions.has(path.extname(entry.name).toLowerCase()) ||
    generatedStressNames.has(entry.name)
  ) {
    assertInside(stressFixturesRoot, entry.fullPath);
    await rm(entry.fullPath, { force: true });
  }
}

await pruneSupersededReports(reportRoot);
process.stdout.write("Generated profile and disposable output cleanup complete.\n");

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Unsafe cleanup target: ${child}`);
  }
}

async function* walkFiles(directory) {
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* walkFiles(fullPath);
      } else if (entry.isFile()) {
        yield { name: entry.name, fullPath };
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function removeWithRetries(target) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await stat(target);
      await rm(target, { recursive: true, force: true, maxRetries: 2 });
      return;
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (
        !["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code) ||
        attempt === 12
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function pruneSupersededReports(directory) {
  const reports = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      assertInside(directory, fullPath);
      try {
        const report = JSON.parse(await readFile(fullPath, "utf8"));
        const profileId =
          typeof report.profileId === "string"
            ? report.profileId
            : entry.name.includes("-gzip-decompress-stress.")
              ? "gzip-decompress"
              : entry.name.includes("-gzip-stress.")
                ? "gzip-compress"
                : null;
        if (!profileId) continue;
        const outcome =
          report.passed === true
            ? "passed"
            : report.passed === false || report.failure
              ? "failed"
              : "unknown";
        reports.push({
          profileId,
          sourceIdentity:
            typeof report.source?.sha256 === "string"
              ? `sha256:${report.source.sha256.toLowerCase()}`
              : Number.isFinite(report.source?.bytes)
                ? `bytes:${report.source.bytes}`
                : Number.isFinite(report.runs?.[0]?.sourceBytes)
                  ? `bytes:${report.runs[0].sourceBytes}`
                  : "source:unknown",
          destinationMode:
            typeof report.destinationMode === "string"
              ? report.destinationMode
              : "sync-opfs",
          outcome,
          generatedAt:
            Date.parse(report.generatedAt ?? "") ||
            (await stat(fullPath)).mtimeMs,
          base: fullPath.slice(0, -path.extname(fullPath).length),
        });
      } catch {
        // Preserve unreadable reports as evidence instead of guessing.
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }

  const byProfile = new Map();
  for (const report of reports) {
    const key = `${report.profileId}:${report.destinationMode}:${report.outcome}:${report.sourceIdentity}`;
    const current = byProfile.get(key) ?? [];
    current.push(report);
    byProfile.set(key, current);
  }
  let removed = 0;
  for (const profileReports of byProfile.values()) {
    profileReports.sort((left, right) => right.generatedAt - left.generatedAt);
    const retained = profileReports[0];
    for (const report of profileReports) {
      if (report === retained) continue;
      for (const extension of [".json", ".csv", ".html"]) {
        const target = `${report.base}${extension}`;
        assertInside(directory, target);
        try {
          await rm(target, { force: true });
          removed += 1;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    }
  }
  return removed;
}
