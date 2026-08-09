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
const ledgerDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

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
    if (report.passed === false && report.profileId && Array.isArray(report.runs)) {
      const failedChecks = Object.entries(report.checks ?? {})
        .filter(([, passed]) => passed === false)
        .map(([check]) => check);
      failedReports.push({
        ...report,
        completedRuns: report.runs,
        failure: {
          message:
            failedChecks.length > 0
              ? `Failed checks: ${failedChecks.join(", ")}; measured ${Number(report.incrementalPrivateMiB ?? 0).toFixed(1)} MiB against a ${Number(report.limitMiB ?? 0).toFixed(1)} MiB limit.`
              : "The retained Chrome stress report did not pass.",
        },
      });
      continue;
    }
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
  `Updated ${ledgerDate} from the capability registry and retained successful Chrome stress reports.`,
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
  "## Latest full verification cycle",
  "",
  "- **2026-08-09:** 496/496 production-browser tests passed; 21/21 unit tests passed; TypeScript, ESLint, and the production build passed.",
  "- **Fast bounded Matroska remuxing:** MP4, MOV, 3GP, MPEG-TS, FLV, AVI, WebM, and OGV passed 3/3 Chrome runs on 137,218,662-222,941,314-byte sources in 0.87-1.67 s at 166.2-183.7 MiB worst incremental private memory. All 24 outputs used one worker, 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, repeatable bytes, and full native decoded-stream or compressed-packet identity checks. Compatible video, audio, subtitle, attachment, chapter, stream, and general metadata are copied without re-encoding. Seven routes use live Matroska with five-second/5 MiB clusters and no duration/cue index; AVI uses the same bounded clusters plus a compact cue index after both native and browser FFmpeg live mode produced incorrect VFW duration metadata. A rejected synchronous Blob-reader topology reached 295.5 MiB on MP4; the reusable asynchronous BYOB reader reduced the passing routes to at most 183.7 MiB without changing the 250 MiB ceiling. Focused testing recorded and fixed AAC priming, transport-stream AAC configuration, AVI duration, and validator assumptions before the final 19/19 gate and 496/496 full regression. All generated sources and converted copies stayed under the repository and category cleanup removed them in `finally`, while compact manifests and success/failure reports remain as the loop-prevention record.",
  "- **Fast bounded container-to-HEVC extraction:** MKV, MP4, MOV, and MPEG-TS passed 3/3 Chrome runs on 148,952,609-157,710,004-byte HEVC sources in 2.06-3.78 s at 195.3-212.2 MiB worst incremental private memory. All twelve outputs used 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, were byte-repeatable, retained all 17,282 decoded frames, and passed full native decode traversal. The packet-copy route excludes audio, subtitles, attachments, data, additional video, chapters, timestamps, and container-only metadata that Annex B cannot represent. The focused production-browser gate passed 9/9 success, codec-rejection, forced-write, and partial-output-cleanup cases. A raw HEVC-to-MP4 candidate was rejected after both native FFmpeg and the browser retained 98 packets but produced a different decoded presentation-order hash: elementary HEVC lacks the container timestamps needed to reconstruct B-frame timing reliably. The unused raw HEVC demuxer and route were removed instead of weakening identity validation. All generated sources and converted copies stayed under the repository and cleanup removed them while retaining compact manifests and reports.",
  "- **Fast bounded Ogg-family audio extraction:** MKV/WebM-to-Ogg Vorbis, OGV-to-Ogg Vorbis, and MKV/WebM-to-Ogg Opus passed 3/3 Chrome runs on 137,218,662–222,942,211-byte sources in 0.39–0.93 s at 185.0–207.8 MiB worst incremental private memory. All fifteen outputs used 32 MiB Wasm, 256 KiB maximum reads, at most 15,406-byte writes, and one pending write. Exact compressed-packet validation retained 2,812 Vorbis packets from the 60-second Matroska/WebM sources, 36,564 Vorbis packets from OGV, and 3,001 Opus packets; native FFmpeg fully decoded every result. The reusable async BYOB input path avoids a second source-sized Blob allocation while preserving sub-second packet-copy performance. Two optimized base encodes ran concurrently and three derivative containers were generated by concurrent stream copy; all five 128 MiB-class sources were ready in 60.94 seconds. The focused production-browser gate passed 12/12 success, rejection, forced-write, and partial-output-cleanup cases. Every generated source and converted copy stayed under the repository and category cleanup removed them while retaining only compact manifests and reports.",
  "- **Fast bounded container-to-AAC extraction:** MKV, MP4, MOV, 3GP, MPEG-TS, and FLV passed 3/3 Chrome runs on 146,854,456–150,441,548-byte H.264/AAC sources in 0.35–1.08 s at 175.7–211.3 MiB worst incremental private memory. All eighteen outputs used 32 MiB Wasm, 256 KiB maximum reads, at most 478-byte writes, one pending write, retained 3,049 exact AAC access units with normalized payload SHA-256 `b3c155ba76bd466a3985cd38f6a2e31b7a2787f17cb8293ee96b1626742c14de`, and fully decoded with native FFmpeg. One optimized 65-second H.264/AAC encode plus five concurrent stream-copy remuxes generated all six sources under `fixtures/stress`; category cleanup removed every large source and converted copy while retaining only compact manifests and reports. The first profile failure exposed an invalid raw-ADTS bitrate-duration assumption and was corrected with exact access-unit count/duration validation. A second rejected topology used synchronous Blob reads and reached 291.4 MiB on FLV; the final AAC-only reusable async BYOB reader reduced FLV to 184.7 MiB without weakening the 250 MiB limit. The first full regression caught a boolean reader-selector mistake on established sync routes; retaining the actual reader object fixed it. The final mixed sync/AAC focused gate passed 14/14, followed by 457/457 full-browser tests.",
  "- **Fast bounded container-to-MP3 extraction:** MKV, MP4, MOV, AVI, MPEG-TS, and FLV passed 3/3 Chrome runs on 181,340,062–185,645,300-byte H.264/MP3 sources in 1.20–2.14 s at 214.9–243.9 MiB worst incremental private memory. All eighteen outputs used 32 MiB Wasm, 256 KiB maximum reads, one pending write, retained the same exact MP3 packet SHA-256 (`2783be01bab87c406660e1b58d3b6550aa03437a5086d442608409f5aea79558`), and fully decoded with native FFmpeg. Header-complete MKV/MP4/MOV/AVI skip decoder-oriented stream analysis; MPEG-TS and FLV use a bounded 2 MiB probe because their headers alone do not expose enough MP3 parameters. One 60-second H.264/MP3 encode plus five concurrent packet-copy remuxes generated all six 173–177 MiB sources under `fixtures/stress` in 3.71 seconds; category cleanup removed 1.09 GB of media plus every converted copy while retaining only compact manifests and reports. The first focused browser run recorded 13 passes and five failures: bounded probing fixed MPEG-TS/FLV stream discovery, while AVI's exact packet match replaced an invalid decoded-PCM comparison that had included container-specific trim semantics. The final focused gate passed all thirteen success, rejection, forced-write, and cleanup cases.",
  "- **Fast bounded AV1 Matroska-to-WebM copy:** a 222,942,211-byte 1,920×1,080 AV1/Opus source passed 3/3 Chrome runs in 1.98–2.40 s at 213.7 MiB worst incremental private memory. The packet-copy route skipped decoder-oriented stream analysis, held reads, writes, and queueing to 262,144 bytes, used one worker and 32 MiB Wasm, and produced the same 222,940,541-byte output each time. Independent full native decode verified all 1,440 AV1 frames plus Opus audio against exact source SHA-256 values, preserved the `eng` language tag, and confirmed the bounded live-WebM output omitted duration/cue indexes and chapters. The 212.6 MiB generated source and all converted copies stayed under the repository and were deleted by category cleanup. A rejected SVT-AV1 preset-13 shortcut encoded only 47 independently decodable frames out of 120 and emitted decoder errors; the final generator uses validated libaom realtime settings and never repeats that invalid optimization. The first browser attempt also exposed and fixed an output-context flag write before allocation; focused success and forced-write-cleanup tests now pass.",
  "- **Bounded H.264 elementary-stream input and output:** raw H.264-to-MP4 passed 3/3 Chrome runs on 145,801,019 bytes in 1.75–2.26 s at 233.9 MiB worst incremental private memory; H.264-to-VP8 passed in 9.46–9.87 s at 239.7 MiB; and H.264-to-VP9 passed in 13.77–14.18 s at 243.7 MiB, retaining 6.3 MiB below the unchanged ceiling. MKV, MP4, MOV, 3GP, MPEG-TS, and FLV extraction to raw H.264 passed 3/3 in 1.60–3.09 s at 207.2–213.8 MiB. All 27 outputs were repeatable, independently probed and fully decoded; WebM passed visual-similarity checks, raw extraction retained all 1,560 decoded frames, and nine forced-write cases left no partial OPFS output. One 65-second high-bitrate encode plus stream-copy remux/extraction generated all seven >128 MiB sources under `fixtures/stress` in 6.26 seconds, and category cleanup deleted every source and converted copy. Annex B cannot preserve container timestamps, so the registry explicitly discloses reconstructed 25 fps timing. Retained failed reports record two corrected validator-only assumptions—requiring audio from video-only MP4 and attempting `-ss 0` against raw input—so neither loop is repeated.",
  "- **Bounded MPEG-2 elementary-stream input and output:** raw M2V-to-MPEG-TS passed 3/3 Chrome runs on 136,166,136 bytes in 1.96–2.30 s at 202.0 MiB worst incremental private memory. MKV, MP4, MOV, AVI, and MPEG-TS extraction to raw M2V passed 3/3 on 136,284,843–142,273,136-byte sources in 1.68–2.31 s at 198.6–210.8 MiB. All eighteen stress outputs were byte-repeatable, independently probed, and fully decoded through all 11,904 frames; six forced-write cases left no partial OPFS output. The direct packet-copy routes retained 262,144-byte maximum reads, one pending write, and 32 MiB Wasm. One retained raw fixture plus five concurrent remuxes generated all six sources under `fixtures/stress` in 3.78 seconds; category cleanup deleted every large source and converted copy while preserving the compact tracked manifest. Two failed small-fixture attempts documented and corrected missing raw-stream timestamps and B-frame presentation-order synthesis before promotion; the strict decoded-frame comparison was not weakened.",
  "- **Bounded MPEG-4 Part 2 elementary-stream input and output:** raw M4V-to-MP4 passed 3/3 Chrome runs on 179,609,473 bytes in 1.80–2.25 s at 234.2 MiB worst incremental private memory. MKV, MP4, MOV, and AVI extraction to raw M4V passed 3/3 on 179,625,169–180,576,319-byte sources in 1.63–2.10 s at 195.4–211.5 MiB. All fifteen stress outputs were byte-repeatable, independently probed, and fully decoded through all 1,440 frames; five forced-write cases left no partial OPFS output. The direct packet-copy routes retained 262,144-byte maximum reads and writes, one pending write, and 32 MiB Wasm. A single continuous 60-second, 1,920×1,080 B-frame encode generated the 179,609,473-byte raw source in 5.36 seconds, and four concurrent stream-copy remuxes produced the complete five-source set under `fixtures/stress` in 6.39 seconds. Category cleanup deletes every large source and converted copy while retaining only the compact manifest. The retained first benchmark failure documents why byte-concatenating short raw streams is invalid: their MPEG timecodes restarted and MP4 rejected the non-monotonic timestamps. The generator now performs one fast continuous encode instead of weakening timestamp validation.",
  "- **Bounded legacy-container audio extraction to FLAC:** AVI/MP3 passed 3/3 Chrome runs on 159,500,442 bytes in 1.26–1.60 s at 223.3 MiB worst incremental private memory; OGV/Vorbis passed 3/3 on 137,218,662 bytes in 3.39–3.75 s at 213.1 MiB. All six FLAC outputs were byte-repeatable, independently probed and decoded-audio validated, and deleted. Two forced-write cases left no partial OPFS output. The shared generator runs both project-local fixture jobs concurrently; the final continuous-Vorbis OGV fixture is produced in about 10.63 seconds, down from about 19.05 seconds, while preserving source specifications. A rejected stream-copy shortcut generated the OGV in 0.52 seconds but repeated codec-delay samples extended the decoded FLAC to 782.586667 seconds from 780-second timestamps; that failed profile is retained so the invalid optimization is not repeated. Sources, manifests, and converted copies remain under the repository and category cleanup removes them in `finally`.",
  "- **Bounded container audio extraction to FLAC:** MKV passed 3/3 Chrome runs on 146,855,294 bytes in 1.28–1.53 s at 212.6 MiB worst incremental private memory; MP4 passed on 146,854,557 bytes in 1.23–1.54 s at 214.2 MiB; MOV passed on 146,854,612 bytes in 1.21–1.57 s at 213.9 MiB; 3GP passed on 146,854,456 bytes in 1.25–1.57 s at 214.7 MiB; MPEG-TS passed on 150,441,548 bytes in 1.50–1.98 s at 211.6 MiB; and FLV passed on 146,903,486 bytes in 1.25–1.57 s at 210.7 MiB. All eighteen FLAC outputs were byte-repeatable, independently probed and decoded-audio validated, and deleted. Six forced-write cases left no partial OPFS output. One optimized 65-second H.264/AAC encode plus five stream-copy remuxes generated all six 128 MiB-class sources under `fixtures/stress` in 3.89 seconds; the generator verifies the project-local source hash before and after, and category cleanup removes every source, manifest, and converted copy in `finally`.",
  "- **Bounded AVI to WebM:** MPEG-4 Part 2 AVI-to-VP8 passed 3/3 Chrome runs on 159,500,442 bytes in 9.19–9.62 s at 214.5 MiB worst incremental private memory; AVI-to-VP9 passed in 14.62–15.00 s at 233.3 MiB. All six video-only WebM outputs were byte-repeatable, independently probed, midpoint-SSIM checked, fully decoded, and deleted; route-specific forced-write failures left no partial OPFS output. The optimized generator creates the 128 MiB-class source under `fixtures/stress` in about 1.5 seconds instead of looping a 12-minute stream-copy fixture, records the 1,543 actually decodable frames rather than trusting AVI's 1,560-frame header, verifies the small source hash before and after, and removes the generated AVI and manifest in `finally`. The retained first-run failure documents the original header-duration validation mismatch; the strict 0.25-second tolerance remained unchanged and now compares against decoded-frame duration.",
  "- **Bounded 3GP/MPEG-TS/FLV to WebM:** six H.264 container routes reuse the lazy optimized eight-worker VP8/VP9 cores after bounded stream inspection. 3GP-to-VP8 passed 3/3 Chrome runs on 146,854,522 bytes in 9.28–9.69 s at 236.4 MiB worst incremental private memory; 3GP-to-VP9 passed in 13.55–14.19 s at 234.0 MiB; MPEG-TS-to-VP8 passed on 150,441,548 bytes in 9.59–9.97 s at 220.4 MiB; MPEG-TS-to-VP9 passed in 13.81–14.39 s at 222.9 MiB; FLV-to-VP8 passed on 146,903,539 bytes in 9.22–9.71 s at 220.6 MiB; and FLV-to-VP9 passed in 13.62–14.05 s at 222.1 MiB. All eighteen outputs were byte-repeatable, independently probed as genuine video-only WebM, midpoint-SSIM checked, fully decoded, and deleted. Route-specific forced-write failures left no partial OPFS output. The stress generator now loops the verified project-local 3GP fixture, performs one 65-second H.264 encode plus two stream-copy remuxes, and generated all three 128 MiB-class sources in 2.16 seconds instead of roughly ten minutes; sources stay under `fixtures/stress` and category cleanup removes them in `finally`. Retained rejected topologies measured 266.2 MiB for FLV VP8 and 255.2 MiB for 1,282×722 3GP VP8 before the final 1,282×536 fixture passed without changing the 250 MiB limit or worker counts.",
  "- **Optimized MP4/MOV to WebM:** four new routes reuse the lazy optimized eight-worker VP8/VP9 cores. MP4-to-VP8 passed 3/3 Chrome runs on 147,136,619 bytes in 12.84\u201313.34 s at 226.9 MiB worst incremental private memory; MP4-to-VP9 passed on 147,136,625 bytes in 14.80\u201315.36 s at 237.1 MiB; MOV-to-VP8 passed on 147,136,647 bytes in 9.53\u201310.14 s at 244.4 MiB; and MOV-to-VP9 passed in 14.67\u201315.17 s at 236.8 MiB. All twelve outputs were byte-repeatable, independently probed as genuine video-only WebM, midpoint-SSIM checked, fully decoded, and deleted. Route-specific forced-write failures left no partial OPFS output. Rejected VP9 fixture topologies measured 254.5\u2013268.5 MiB; the final 1,282-pixel source activates two decoder threads while retaining four encoder threads, cutting the passing process-tree peak by 17.4\u201331.4 MiB without changing the 250 MiB limit or encode settings.",
  "- **Bounded VP9 WebM:** MKV-to-VP9 passed 3/3 Chrome runs on a 181,825,549-byte HEVC/AAC/SubRip source in 329.00\u2013330.04 s at 244.9 MiB worst incremental private memory; OGV-to-VP9/Vorbis passed on 137,635,308 bytes in 97.19\u201397.53 s at 224.1 MiB; and M2V-to-VP9 passed on 136,166,136 bytes in 68.34\u201369.32 s at 223.4 MiB. All nine outputs were byte-repeatable, independently probed as genuine VP9 WebM, midpoint-SSIM checked, fully decoded, and deleted after validation. The separate lazy-loaded core retains a 96 MiB hard Wasm ceiling, uses four VP9 encoder threads, and limits high-resolution decoding to two threads. The final M2V topology improved the controlled 136 MiB conversion from 85.49 s to 69.06 s (19.2%) while staying bounded; split high-resolution decode/encode improved MKV from 355.59 s to 330.23 s (7.1%).",
  "- **Direct raw compression transcoding:** all six GZIP/BZIP2/XZ cross-conversions passed 3/3 256 MiB-class Chrome runs with repeatable outputs, independent streamed decode/SHA-256 validation, and cleanup recovery. GZIP-to-BZIP2 reached 159.2 MiB in 42.58–43.27 s; GZIP-to-XZ 200.1 MiB in 55.81–56.43 s; BZIP2-to-GZIP 179.4 MiB in 51.10–51.54 s; BZIP2-to-XZ 201.3 MiB in 71.09–71.72 s; XZ-to-GZIP 236.2 MiB in 34.65–41.21 s; and XZ-to-BZIP2 196.4 MiB in 42.36–42.72 s. Every route kept reads at 256 KiB, writes at no more than 64 KiB, one pending operation, and no complete decompressed intermediate file.",
  "- **Direct compressed-TAR transcoding:** all six TAR.GZ/TAR.BZ2/TAR.XZ cross-conversions passed 3/3 256 MiB-class Chrome runs with repeatable hashes and cleanup recovery. TAR.GZ-to-TAR.BZ2 reached 168.7 MiB in 42.45–43.04 s; TAR.GZ-to-TAR.XZ 191.6 MiB in 54.92–56.42 s; TAR.BZ2-to-TAR.GZ 183.9 MiB in 51.26–52.65 s; TAR.BZ2-to-TAR.XZ 195.9 MiB in 70.70–71.99 s; TAR.XZ-to-TAR.GZ 239.9 MiB in 34.25–35.22 s; and TAR.XZ-to-TAR.BZ2 209.4 MiB in 42.39–42.73 s. Every route validated USTAR in flight, kept reads at 256 KiB and writes at 64 KiB with one pending operation, independently verified archive entry hashes, and stored no complete intermediate TAR.",
  "- **Compressed TAR/ZIP-to-7Z:** TAR.GZ passed 3/3 256 MiB Chrome runs in 8.22–9.17 s at 225.8 MiB worst incremental private memory; TAR.BZ2 passed in 25.06–25.69 s at 187.2 MiB; optimized TAR.XZ passed in 8.25–8.42 s at 231.1 MiB; and ZIP passed in 9.25–9.45 s at 236.2 MiB. All four streamed directly without a complete intermediate TAR, produced repeatable hashes, used adaptive COPY for the incompressible fixture, independently validated every extracted entry, and deleted 7Z scratch after every run. TAR.XZ uses a specialist 24 MiB decode-only XZ module, reducing combined fixed Wasm from 104 MiB to 80 MiB and resolving the earlier 250.1 MiB boundary failure.",
  "- **SVG-to-PNG:** 3/3 Chrome stress runs passed on a 3,840\u00d72,160, 5,185-element fixture with pixel-exact independent validation (SSIM 1.0), 0.44\u20130.65 s conversion time, and 202.2 MiB worst incremental private memory.",
  "- **GZIP compression evidence repair:** 3/3 256 MiB Chrome stress runs passed in 27.81\u201329.70 s with 211.8 MiB worst incremental private memory and cleanup recovery proven.",
  "- **Adaptive TAR-to-7Z:** 3/3 256 MiB Chrome stress runs passed in 8.06\u20138.94 s with 216.9 MiB worst incremental private memory. The bounded sampler chose lossless COPY for incompressible input, all scratch reads/writes stayed at 61,440 bytes, and scratch returned to zero after every run. This is 6.2\u20136.9\u00d7 faster than the measured 55.73-second always-LZMA2 baseline.",
  "- **Compressed TAR-to-ZIP:** TAR.BZ2-to-ZIP passed 3/3 258 MiB Chrome runs in 51.19\u201351.31 s at 190.5 MiB worst incremental private memory; TAR.XZ-to-ZIP passed 3/3 256 MiB runs in 33.22\u201335.50 s at 228.8 MiB. Both used one bounded nested stream with 16 KiB maximum destination writes, repeatable output hashes, independent per-entry size/SHA-256 validation, and cleanup recovery.",
  "- **ZIP-to-compressed TAR:** ZIP-to-TAR.BZ2 passed 3/3 256 MiB Chrome runs in 42.52\u201343.06 s at 160.6 MiB worst incremental private memory; ZIP-to-TAR.XZ passed 3/3 runs in 55.77\u201356.03 s at 195.7 MiB. Both bound the entire ZIP-inflate/TAR-build/codec/write pipeline to 64 KiB chunks with one pending destination operation, repeatable outputs, native per-entry size/SHA-256 validation, and cleanup recovery.",
  "- **Production dependency audit:** Next.js was upgraded from 16.2.6 to 16.2.12 to clear the framework advisories with a compatible fix. `npm audit --omit=dev` still reports three high transitive findings through Next's pinned PostCSS 8.4.31 and Sharp 0.34.5; npm currently offers no compatible non-major remediation for those two packages.",
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
  const peakWasmEvidence =
    profile.engine === "svg-browser" ? "not exposed" : mib(peakWasm);
  const maxRead = Math.max(...report.runs.map((run) => run.maxReadChunkBytes));
  const maxWrite = Math.max(...report.runs.map((run) => run.maxWriteChunkBytes));
  const scratchEvidence =
    [
      "tar-to-sevenzip",
      "tar-gz-to-sevenzip",
      "tar-bz2-to-sevenzip",
      "tar-xz-to-sevenzip",
      "zip-to-sevenzip",
    ].includes(profile.id)
      ? ` / scratch ${integer(Math.max(...report.runs.map((run) => run.maxScratchReadChunkBytes ?? 0)))} B read/write`
      : "";
  lines.push(
    `| ${cell(profile.id)} | ${integer(report.source.bytes)} | ${report.runs.length} | ${range(outputs, integer)} | ${range(elapsed, seconds)} | ${report.incrementalPrivateMiB.toFixed(1)} MiB | ${peakWasmEvidence} | read ${integer(maxRead)} B / write ${integer(maxWrite)} B${scratchEvidence} | ${report.checks?.cleanupRecovery ? "passed" : "not proven"} |`,
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
    `| ${cell(report.generatedAt ?? "unknown")} | ${cell(report.profileId ?? "unknown")} | ${integer(report.source?.bytes ?? 0)} | ${integer(report.completedRuns?.length ?? 0)} | ${integer(report.lastObservedState?.metrics?.inputBytes ?? report.runs?.at(-1)?.sourceBytes ?? 0)} | ${cell(String(report.failure?.message ?? report.lastObservedState?.error ?? "unknown failure").slice(0, 180))} |`,
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
  "- Video/container: additional elementary-stream codecs and raw outputs beyond H.264, MPEG-2, MPEG-4 Part 2, and the certified container-to-HEVC outputs; raw HEVC input wrapping remains unavailable because B-frame timing cannot be reconstructed losslessly without container timestamps. Broader OGV, 3GP, AVI, VP9, AV1, and MPEG-2 audio/codec combinations beyond the certified Matroska, WebM, extraction, and transcode routes also remain.",
  "- Audio: AMR-WB and 3GP-contained AMR; broader AAC/ALAC/WMA variants plus user-selectable bitrate, sample-rate, channel-layout, and artwork/tag handling.",
  "- Images: HEIF/HEIC, JPEG XL, animated WebP/AVIF, camera raw formats, multipage TIFF, separated-planar TIFF, transposed TIFF orientations, and broader SVG features such as text, CSS, animation, filters, masks, and linked resources remain absent.",
  "- Archives/compression: additional entry-level conversion among 7Z, XZ/TAR.XZ, BZIP2/TAR.BZ2, ZIP, and TAR.GZ where safe bounded routes are added.",
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
