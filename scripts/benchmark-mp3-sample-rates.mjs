import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work", "amrwb-audit", "mp3-rate-benchmark");
const reportRoot = path.join(projectRoot, "outputs", "reports");
const reportPath = path.join(reportRoot, "mp3-sample-rate-benchmark.json");
const durationSeconds = 3_600;
const qualityDurationSeconds = 300;
const iterations = 3;
const cases = [
  {
    id: "amr-nb-current-32k-128k",
    source: path.join(projectRoot, "fixtures", "media", "audio-source.amr"),
    referenceSampleRate: 8_000,
    outputSampleRate: 32_000,
    bitRate: 128_000,
  },
  {
    id: "amr-nb-preserved-8k-32k",
    source: path.join(projectRoot, "fixtures", "media", "audio-source.amr"),
    referenceSampleRate: 8_000,
    outputSampleRate: 8_000,
    bitRate: 32_000,
  },
  {
    id: "amr-nb-preserved-8k-40k",
    source: path.join(projectRoot, "fixtures", "media", "audio-source.amr"),
    referenceSampleRate: 8_000,
    outputSampleRate: 8_000,
    bitRate: 40_000,
  },
  {
    id: "amr-wb-current-32k-128k",
    source: path.join(projectRoot, "fixtures", "media", "amr-wb-source.awb"),
    referenceSampleRate: 16_000,
    outputSampleRate: 32_000,
    bitRate: 128_000,
  },
  {
    id: "amr-wb-preserved-16k-64k",
    source: path.join(projectRoot, "fixtures", "media", "amr-wb-source.awb"),
    referenceSampleRate: 16_000,
    outputSampleRate: 16_000,
    bitRate: 64_000,
  },
  {
    id: "amr-wb-preserved-16k-80k",
    source: path.join(projectRoot, "fixtures", "media", "amr-wb-source.awb"),
    referenceSampleRate: 16_000,
    outputSampleRate: 16_000,
    bitRate: 80_000,
  },
];

await mkdir(workRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });
const results = [];

for (const candidate of cases) {
  const runs = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const outputPath = path.join(workRoot, `${candidate.id}-${iteration}.mp3`);
    try {
      const startedAt = performance.now();
      await runFfmpeg([
        "-y", "-stream_loop", "-1", "-i", candidate.source,
        "-t", String(durationSeconds), "-map", "0:a:0", "-vn", "-map_metadata", "-1",
        "-ar", String(candidate.outputSampleRate), "-ac", "1",
        "-c:a", "libmp3lame", "-b:a", String(candidate.bitRate),
        "-compression_level", "9", outputPath,
      ]);
      const elapsedSeconds = (performance.now() - startedAt) / 1_000;
      const probe = await probeAudio(outputPath);
      const asdrDb = await measureAsdr(candidate, outputPath);
      runs.push({
        iteration,
        elapsedSeconds,
        realtimeFactor: durationSeconds / elapsedSeconds,
        outputBytes: (await stat(outputPath)).size,
        outputSampleRate: Number(probe.sample_rate),
        observedBitRate: Number(probe.bit_rate),
        durationSeconds: Number(probe.duration),
        asdrDb,
      });
    } finally {
      await rm(outputPath, { force: true });
    }
  }
  results.push({ ...candidate, source: path.relative(projectRoot, candidate.source), runs });
}

const report = {
  generatedAt: new Date().toISOString(),
  generatedBy: "scripts/benchmark-mp3-sample-rates.mjs",
  durationSeconds,
  qualityDurationSeconds,
  iterations,
  results,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${reportPath}\n`);

async function runFfmpeg(arguments_) {
  return execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-nostdin", ...arguments_],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
}

async function probeAudio(outputPath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=sample_rate,bit_rate,duration",
      "-of", "json", outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  if (probe.streams?.length !== 1) {
    throw new Error(`Expected one MP3 audio stream in ${outputPath}.`);
  }
  return probe.streams[0];
}

async function measureAsdr(candidate, outputPath) {
  const sampleRate = candidate.referenceSampleRate;
  const trim = `atrim=duration=${qualityDurationSeconds},asetpts=PTS-STARTPTS`;
  const format = `aresample=${sampleRate},aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono`;
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-stream_loop", "-1", "-i", candidate.source,
      "-i", outputPath, "-filter_complex",
      `[0:a:0]${trim},${format}[source];[1:a:0]${trim},${format}[converted];[source][converted]asdr[quality]`,
      "-map", "[quality]", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const values = [
    ...stderr.matchAll(/SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi),
  ].map((match) => Number(match[1]));
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Could not read ASDR from ${outputPath}.`);
  }
  return Math.min(...values);
}
