import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workRoot = path.resolve(projectRoot, "work");
const outputsRoot = path.resolve(projectRoot, "outputs");
const reportRoot = path.resolve(outputsRoot, "reports");
const aviSourceExpansionReports = [
  "2026-09-08T09-57-45-216Z-3gp-to-avi-stress",
  "2026-09-08T10-00-44-455Z-mpeg-ts-to-avi-stress",
  "2026-09-08T10-02-40-598Z-mp4-to-avi-stress",
  "2026-09-08T10-04-54-361Z-mov-to-avi-stress",
  "2026-09-08T10-08-06-333Z-mkv-to-avi-stress",
  "2026-09-08T15-03-27-508Z-mkv-to-avi-stress-failure",
  "2026-09-08T15-05-40-124Z-mkv-to-avi-stress",
].flatMap((stem) =>
  ["json", "csv", "html"].map((extension) =>
    path.resolve(reportRoot, `${stem}.${extension}`),
  ),
);
const ivfStressReports = [
  "2026-09-08T21-41-54-318Z-mkv-to-ivf-stress",
  "2026-09-08T21-44-55-098Z-webm-to-ivf-stress",
].flatMap((stem) =>
  ["json", "csv", "html"].map((extension) =>
    path.resolve(reportRoot, `${stem}.${extension}`),
  ),
);
const hevcWebmStressReports = [
  "2026-09-09T17-20-11-878Z-hevc-to-webm-stress",
  "2026-09-09T17-39-03-977Z-hevc-to-webm-vp9-stress",
  "2026-09-09T17-52-11-741Z-hevc-to-webm-vp9-stress",
  "2026-09-09T18-07-02-520Z-hevc-to-webm-stress",
].flatMap((stem) =>
  ["json", "csv", "html"].map((extension) =>
    path.resolve(reportRoot, `${stem}.${extension}`),
  ),
);
const disposableOutputRoot = path.resolve(projectRoot, "output");
const remuxEngineRoot = path.resolve(projectRoot, "public", "engines", "remux");
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
const browserImageSmokeRoot = path.resolve(outputsRoot, "browser-image-smoke");
const browserMediaSmokeRoot = path.resolve(outputsRoot, "browser-media-smoke");
const browserIvfInputRoot = path.resolve(outputsRoot, "browser-ivf-input");
const stressFixturesRoot = path.resolve(projectRoot, "fixtures", "stress");
const profileRoot = path.resolve(workRoot, "memory-profile-chrome");
const cancellationFixture = path.resolve(
  workRoot,
  "cancellation-source.ndjson",
);
const documentCancellationFixture = path.resolve(
  workRoot,
  "cancellation-source.txt",
);
const markdownCancellationFixture = path.resolve(
  workRoot,
  "cancellation-source.md",
);
const hostedHevcFallbackFixture = path.resolve(
  workRoot,
  "ci-hevc-fallback.mov",
);
const mediaDebugOutput = path.resolve(workRoot, "debug-output.flv");
const webmBenchmarkFixture = path.resolve(
  stressFixturesRoot,
  "media",
  "webm-benchmark-120s.mkv",
);
const downloadedFfmpegArchive = path.resolve(workRoot, "ffmpeg-8.1.2.tar.xz");
const aacBenchmarkRoot = path.resolve(workRoot, "aac-benchmark");
const opusBenchmarkRoot = path.resolve(workRoot, "opus-benchmark");
const vorbisBenchmarkRoot = path.resolve(workRoot, "vorbis-benchmark");
const wmaSpeechBenchmarkRoot = path.resolve(workRoot, "wma-speech-benchmark");
const amrWbAuditRoot = path.resolve(workRoot, "amrwb-audit");
const amrWbWmaAuditRoot = path.resolve(workRoot, "amrwb-wma-audit");
const avifTemporaryRoots = [
  path.resolve(workRoot, "avif-output-audit"),
  path.resolve(workRoot, "avif-encoder-probe"),
  path.resolve(workRoot, "avif-engine-test"),
  path.resolve(workRoot, "avif-memory-fixtures"),
  path.resolve(workRoot, "avif-reproduction"),
  path.resolve(workRoot, "avif-reproduction-final"),
  path.resolve(workRoot, "libavif-audit"),
];
const avifDiagnosticFiles = [
  path.resolve(workRoot, "animated-avif-browser-frame.png"),
  path.resolve(workRoot, "browser-avif-frame.rgba"),
  path.resolve(workRoot, "native-avif-frame.rgba"),
];
const taskTempRoots = [
  path.resolve(workRoot, "automatic-route-audit"),
  path.resolve(workRoot, "avi-to-3gp-feasibility"),
  path.resolve(workRoot, "avi-to-3gp-candidate"),
  path.resolve(workRoot, "playwright-profile-avi-to-3gp"),
  path.resolve(workRoot, "ivf-input-browser"),
  path.resolve(workRoot, "playwright-profile-ivf-input"),
  path.resolve(workRoot, "ivf-input-candidate"),
  path.resolve(workRoot, "hevc-candidate-artifact"),
  path.resolve(workRoot, "avi-mpeg2-feasibility"),
  path.resolve(workRoot, "avi-mpeg2-candidate"),
  path.resolve(workRoot, "avi-source-feasibility"),
  path.resolve(workRoot, "avi-loop-debug.mkv"),
  path.resolve(workRoot, "avi-loop-debug.mpegts"),
  path.resolve(workRoot, "avi-candidate-build"),
  path.resolve(workRoot, "vorbis-npm-cache"),
  path.resolve(workRoot, "vorbis-process-temp"),
  path.resolve(workRoot, "3gp-amr-npm-cache"),
  path.resolve(workRoot, "3gp-amr-process-temp"),
  path.resolve(workRoot, "wma-output-npm-cache"),
  path.resolve(workRoot, "wma-output-process-temp"),
];
const ffmpegReproBuildRoots = [
  path.resolve(workRoot, "ffmpeg-mp3-options-candidate"),
  path.resolve(workRoot, "bzip2-nondocker-build"),
  path.resolve(workRoot, "bzip2-nondocker-output"),
  path.resolve(workRoot, "xz-nondocker-build"),
  path.resolve(workRoot, "xz-nondocker-output"),
  path.resolve(workRoot, "xz-decoder-nondocker-build"),
  path.resolve(workRoot, "xz-decoder-nondocker-output"),
  path.resolve(workRoot, "archive7z-nondocker-build"),
  path.resolve(workRoot, "archive7z-nondocker-output"),
  path.resolve(workRoot, "tiff-nondocker-build"),
  path.resolve(workRoot, "tiff-nondocker-output"),
  path.resolve(workRoot, "tiff-mismatch-candidate"),
  path.resolve(workRoot, "jxl-nondocker-build"),
  path.resolve(workRoot, "jxl-nondocker-output"),
  path.resolve(workRoot, "jxl-encoder-nondocker-build"),
  path.resolve(workRoot, "jxl-encoder-nondocker-output"),
  path.resolve(workRoot, "avif-nondocker-build"),
  path.resolve(workRoot, "avif-nondocker-output"),
  path.resolve(workRoot, "avif-encoder-nondocker-build"),
  path.resolve(workRoot, "avif-encoder-nondocker-output"),
  path.resolve(workRoot, "avif-encoder-mismatch-candidate"),
  path.resolve(workRoot, "remux-build"),
  path.resolve(workRoot, "remux-build-2"),
  path.resolve(workRoot, "remux-build-final"),
  path.resolve(workRoot, "aiff-repro-build"),
  path.resolve(workRoot, "amr-repro-build"),
  path.resolve(workRoot, "amr-repro-verify"),
  path.resolve(workRoot, "mp3-repro-build"),
  path.resolve(workRoot, "mp3-repro-verify"),
  path.resolve(workRoot, "aac-repro-build"),
  path.resolve(workRoot, "aac-repro-verify"),
  path.resolve(workRoot, "opus-repro-build"),
  path.resolve(workRoot, "opus-repro-verify"),
  path.resolve(workRoot, "vorbis-engine-build"),
  path.resolve(workRoot, "vorbis-repro-build"),
  path.resolve(workRoot, "vorbis-repro-verify"),
  path.resolve(workRoot, "remux-wma-build-20260820"),
  path.resolve(workRoot, "remux-wma-repro-20260820"),
];
const lameAuditRoot = path.resolve(workRoot, "lame-audit");
const sevenZipAuditRoot = path.resolve(workRoot, "libarchive-audit");
const tiffAuditRoot = path.resolve(workRoot, "tiff-audit");
const jpegAuditRoot = path.resolve(workRoot, "jpeg-audit");
const sevenZipExperimentRoots = [
  path.resolve(workRoot, "7z-experiment"),
  path.resolve(workRoot, "sevenzip-name-check"),
  path.resolve(workRoot, "sevenzip-name-check-2"),
];
const detachedProfileLogs = [
  path.resolve(workRoot, "wma-output-audit-m4a-aac.wma"),
  path.resolve(workRoot, "wma-output-audit-m4a-alac.wma"),
  path.resolve(workRoot, "wma-output-audit-aac.wma"),
  path.resolve(workRoot, "wma-output-audit-mp3.wma"),
  path.resolve(workRoot, "wma-output-audit-aiff.wma"),
  path.resolve(workRoot, "wma-output-audit-ogg.wma"),
  path.resolve(workRoot, "wma-output-audit-opus.wma"),
  path.resolve(workRoot, "3gp-amr-audit.3gp"),
  path.resolve(workRoot, "3gp-amr-audit.aiff"),
  path.resolve(workRoot, "3gp-amr-audit.mp3"),
  path.resolve(workRoot, "3gp-amr-audit.opus"),
  path.resolve(workRoot, "3gp-amr-audit.ogg"),
  path.resolve(workRoot, "webm-profile-run.stdout.log"),
  path.resolve(workRoot, "webm-profile-run.stderr.log"),
  path.resolve(workRoot, "mp3-docker-build.stdout.log"),
  path.resolve(workRoot, "mp3-docker-build.stderr.log"),
  path.resolve(workRoot, "mp3-browser-tests.stdout.log"),
  path.resolve(workRoot, "mp3-browser-tests.stderr.log"),
  path.resolve(workRoot, "mp3-fixtures.stdout.log"),
  path.resolve(workRoot, "mp3-fixtures.stderr.log"),
  path.resolve(workRoot, "mp3-profile-run.stdout.log"),
  path.resolve(workRoot, "mp3-profile-run.stderr.log"),
  path.resolve(workRoot, "mp3-full-regression.stdout.log"),
  path.resolve(workRoot, "mp3-full-regression.stderr.log"),
  path.resolve(workRoot, "aac-build.stdout.log"),
  path.resolve(workRoot, "aac-build.stderr.log"),
  path.resolve(workRoot, "aac-browser.stdout.log"),
  path.resolve(workRoot, "aac-browser.stderr.log"),
  path.resolve(workRoot, "aac-profile.stdout.log"),
  path.resolve(workRoot, "aac-profile.stderr.log"),
  path.resolve(workRoot, "aac-full-regression.stdout.log"),
  path.resolve(workRoot, "aac-full-regression.stderr.log"),
  path.resolve(workRoot, "aac-repro-build.stdout.log"),
  path.resolve(workRoot, "aac-repro-build.stderr.log"),
  path.resolve(workRoot, "aac-repro-verify.stdout.log"),
  path.resolve(workRoot, "aac-repro-verify.stderr.log"),
  path.resolve(workRoot, "opus-build.stdout.log"),
  path.resolve(workRoot, "opus-build.stderr.log"),
  path.resolve(workRoot, "opus-browser.stdout.log"),
  path.resolve(workRoot, "opus-browser.stderr.log"),
  path.resolve(workRoot, "opus-profile.stdout.log"),
  path.resolve(workRoot, "opus-profile.stderr.log"),
  path.resolve(workRoot, "opus-output-profile.stdout.log"),
  path.resolve(workRoot, "opus-output-profile.stderr.log"),
  path.resolve(workRoot, "opus-full-regression.stdout.log"),
  path.resolve(workRoot, "opus-full-regression.stderr.log"),
  path.resolve(workRoot, "full-browser-opus.stdout.log"),
  path.resolve(workRoot, "full-browser-opus.stderr.log"),
  path.resolve(workRoot, "opus-repro-build.stdout.log"),
  path.resolve(workRoot, "opus-repro-build.stderr.log"),
  path.resolve(workRoot, "opus-repro-verify.stdout.log"),
  path.resolve(workRoot, "opus-repro-verify.stderr.log"),
  path.resolve(workRoot, "vorbis-build.stdout.log"),
  path.resolve(workRoot, "vorbis-build.stderr.log"),
  path.resolve(workRoot, "vorbis-browser.stdout.log"),
  path.resolve(workRoot, "vorbis-browser.stderr.log"),
  path.resolve(workRoot, "vorbis-profile.stdout.log"),
  path.resolve(workRoot, "vorbis-profile.stderr.log"),
  path.resolve(workRoot, "vorbis-full-regression.stdout.log"),
  path.resolve(workRoot, "vorbis-full-regression.stderr.log"),
  path.resolve(workRoot, "vorbis-repro-build.stdout.log"),
  path.resolve(workRoot, "vorbis-repro-build.stderr.log"),
  path.resolve(workRoot, "vorbis-repro-verify.stdout.log"),
  path.resolve(workRoot, "vorbis-repro-verify.stderr.log"),
];
const headedBrowserLogs = [
  path.resolve(workRoot, "headed-server.stdout.log"),
  path.resolve(workRoot, "headed-server.stderr.log"),
];
const retainedOutputExtensions = new Set([".json", ".csv", ".html"]);
const generatedStressExtensions = new Set([
  ".png",
  ".bin",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".mkv",
  ".m4a",
  ".mp3",
  ".flac",
  ".aiff",
  ".aac",
  ".ogg",
  ".ogv",
  ".opus",
  ".wma",
  ".amr",
  ".mp4",
  ".mov",
  ".3gp",
  ".ts",
  ".m2ts",
  ".m2v",
  ".m4v",
  ".h264",
  ".hevc",
  ".h265",
  ".mpegts",
  ".flv",
  ".avi",
  ".webm",
  ".ivf",
  ".awb",
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
  ".tif",
  ".tiff",
  ".jxl",
  ".svg",
]);
const generatedStressNames = new Set([
  "tiff-rgb-tiled-multipage-48m.tiff.json",
  "audio-artwork-128m.mp4.json",
  "audio-amr-wb-128m.awb.json",
  "records-128m.json",
  "h264-aac-128m.3gp.json",
  "h264-aac-128m.mpegts.json",
  "h264-aac-128m.flv.json",
  "mpeg4-mp3-webm-128m.avi.json",
  "h264-aac-flac-128m.3gp.json",
  "h264-aac-flac-128m.mp4.json",
  "h264-aac-flac-128m.mov.json",
  "h264-aac-flac-128m.mkv.json",
  "h264-aac-flac-128m.mpegts.json",
  "h264-aac-flac-128m.flv.json",
  "h264-elementary-128m.h264.json",
  "hevc-elementary-128m.hevc.json",
  "hevc-video-128m.mkv.json",
  "hevc-video-128m.mp4.json",
  "hevc-video-128m.mpegts.json",
  "av1-opus-128m.webm.json",
  "av1-vorbis-128m.mkv.json",
  "av1-vorbis-128m.webm.json",
  "compatible-vp9-opus-128m.mkv.json",
  "compatible-vp9-opus-128m.webm.json",
  "compatible-vp9-128m.ivf.json",
  "compatible-av1-128m.ivf.json",
  "theora-vorbis-copy-128m.mkv.json",
  "mpeg4-mp3-avi-copy-128m.mkv.json",
  "mpeg4-mp3-avi-copy-128m.mp4.json",
  "mpeg4-mp3-avi-copy-128m.mov.json",
  "mpeg4-avi-copy-128m.3gp.json",
  "mpeg2-mp3-avi-copy-192m.mkv.json",
  "mpeg4-mp3-avi-copy-128m.mpegts.json",
  "mpeg2-video-128m.mkv.json",
  "mpeg2-video-128m.mp4.json",
  "mpeg2-video-128m.mov.json",
  "mpeg2-video-128m.avi.json",
  "mpeg2-video-128m.mpegts.json",
  "mpeg4-video-128m.mkv.json",
  "mpeg4-video-128m.mp4.json",
  "mpeg4-video-128m.mov.json",
  "mpeg4-video-128m.avi.json",
]);

assertInside(workRoot, profileRoot);
assertInside(workRoot, cancellationFixture);
assertInside(workRoot, documentCancellationFixture);
assertInside(workRoot, markdownCancellationFixture);
assertInside(workRoot, hostedHevcFallbackFixture);
assertInside(workRoot, mediaDebugOutput);
assertInside(workRoot, downloadedFfmpegArchive);
assertInside(workRoot, aacBenchmarkRoot);
assertInside(workRoot, opusBenchmarkRoot);
assertInside(workRoot, vorbisBenchmarkRoot);
assertInside(workRoot, wmaSpeechBenchmarkRoot);
assertInside(workRoot, amrWbAuditRoot);
assertInside(workRoot, amrWbWmaAuditRoot);
for (const temporaryRoot of avifTemporaryRoots) {
  assertInside(workRoot, temporaryRoot);
}
for (const diagnosticFile of avifDiagnosticFiles) {
  assertInside(workRoot, diagnosticFile);
}
for (const temporaryRoot of taskTempRoots) {
  assertInside(workRoot, temporaryRoot);
}
for (const temporaryRoot of ffmpegReproBuildRoots) {
  assertInside(workRoot, temporaryRoot);
}
assertInside(workRoot, lameAuditRoot);
assertInside(workRoot, sevenZipAuditRoot);
assertInside(workRoot, tiffAuditRoot);
assertInside(workRoot, jpegAuditRoot);
for (const temporaryRoot of sevenZipExperimentRoots) {
  assertInside(workRoot, temporaryRoot);
}
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
assertInside(outputsRoot, browserIvfInputRoot);
assertInside(outputsRoot, reportRoot);
for (const reportPath of aviSourceExpansionReports) {
  assertInside(reportRoot, reportPath);
}
for (const reportPath of ivfStressReports) {
  assertInside(reportRoot, reportPath);
}
for (const reportPath of hevcWebmStressReports) {
  assertInside(reportRoot, reportPath);
}
assertInside(projectRoot, remuxEngineRoot);

if (process.argv.includes("--test-artifacts-only")) {
  await removeWithRetries(playwrightCliRoot);
  await removeWithRetries(playwrightOutputRoot);
  await removeWithRetries(playwrightImageProfileRoot);
  await removeWithRetries(playwrightMediaProfileRoot);
  await removeWithRetries(playwrightPrivacyProfileRoot);
  await removeWithRetries(playwrightSmallProfileRoot);
  await removeWithRetries(browserImageSmokeRoot);
  await removeWithRetries(browserMediaSmokeRoot);
  await removeWithRetries(browserIvfInputRoot);
  await removeCompatibilityTestRoots();
  await rm(cancellationFixture, { force: true });
  await rm(documentCancellationFixture, { force: true });
  await rm(markdownCancellationFixture, { force: true });
  await rm(hostedHevcFallbackFixture, { force: true });
  await rm(mediaDebugOutput, { force: true });
  for (const logPath of headedBrowserLogs) await rm(logPath, { force: true });
  process.stdout.write("Disposable browser test artifacts removed.\n");
  process.exit(0);
}

if (process.argv.includes("--benchmark-artifacts-only")) {
  await removeWithRetries(profileRoot);
  await rm(webmBenchmarkFixture, { force: true });
  process.stdout.write(
    "Disposable benchmark fixture and browser profile removed.\n",
  );
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
await removeWithRetries(browserIvfInputRoot);
await removeCompatibilityTestRoots();
await rm(cancellationFixture, { force: true });
await rm(documentCancellationFixture, { force: true });
await rm(markdownCancellationFixture, { force: true });
await rm(hostedHevcFallbackFixture, { force: true });
await rm(mediaDebugOutput, { force: true });
await rm(downloadedFfmpegArchive, { force: true });
await removeWithRetries(aacBenchmarkRoot);
await removeWithRetries(opusBenchmarkRoot);
await removeWithRetries(vorbisBenchmarkRoot);
await removeWithRetries(wmaSpeechBenchmarkRoot);
await removeWithRetries(amrWbAuditRoot);
await removeWithRetries(amrWbWmaAuditRoot);
for (const temporaryRoot of avifTemporaryRoots) {
  await removeWithRetries(temporaryRoot);
}
for (const diagnosticFile of avifDiagnosticFiles) {
  await rm(diagnosticFile, { force: true });
}
for (const temporaryRoot of taskTempRoots) {
  await removeWithRetries(temporaryRoot);
}
for (const temporaryRoot of ffmpegReproBuildRoots) {
  await removeWithRetries(temporaryRoot);
}
await removeWithRetries(lameAuditRoot);
await removeWithRetries(sevenZipAuditRoot);
await removeWithRetries(tiffAuditRoot);
await removeWithRetries(jpegAuditRoot);
for (const temporaryRoot of sevenZipExperimentRoots) {
  await removeWithRetries(temporaryRoot);
}
for (const logPath of detachedProfileLogs) {
  try {
    await rm(logPath, { force: true });
  } catch (error) {
    if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
  }
}
for (const logPath of headedBrowserLogs) await rm(logPath, { force: true });
for (const reportPath of aviSourceExpansionReports) {
  await rm(reportPath, { force: true });
}
for (const reportPath of ivfStressReports) {
  await rm(reportPath, { force: true });
}
for (const reportPath of hevcWebmStressReports) {
  await rm(reportPath, { force: true });
}

for (const entry of await readdir(remuxEngineRoot, {
  withFileTypes: true,
}).catch(() => [])) {
  if (entry.isFile() && entry.name.startsWith(".tmp.")) {
    const temporaryExport = path.resolve(remuxEngineRoot, entry.name);
    assertInside(remuxEngineRoot, temporaryExport);
    await rm(temporaryExport, { force: true });
  }
}

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
process.stdout.write(
  "Generated profile and disposable output cleanup complete.\n",
);

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

async function removeCompatibilityTestRoots() {
  const prefixes = [
    "browser-compatibility-",
    "playwright-profile-compatibility-",
  ];
  for (const entry of await readdir(workRoot, { withFileTypes: true }).catch(
    () => [],
  )) {
    if (
      !entry.isDirectory() ||
      !prefixes.some((prefix) => entry.name.startsWith(prefix))
    ) {
      continue;
    }
    const target = path.resolve(workRoot, entry.name);
    assertInside(workRoot, target);
    await removeWithRetries(target);
  }
}

async function pruneSupersededReports(directory) {
  const reports = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        path.extname(entry.name).toLowerCase() !== ".json"
      ) {
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
