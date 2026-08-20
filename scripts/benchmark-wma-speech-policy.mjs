import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work", "wma-speech-benchmark");
const reportRoot = path.join(projectRoot, "outputs", "reports");
const reportPath = path.join(reportRoot, "wma-speech-policy-benchmark.json");
const source = path.join(projectRoot, "fixtures", "media", "amr-wb-source.awb");
const durationSeconds = 3_600;
const qualityDurationSeconds = 300;
const iterations = 3;
const cases = [
  { id: "preserved-16k-64k", outputSampleRate: 16_000, bitRate: 64_000 },
  { id: "preserved-16k-96k", outputSampleRate: 16_000, bitRate: 96_000 },
  { id: "upsampled-22k-64k", outputSampleRate: 22_050, bitRate: 64_000 },
  { id: "upsampled-32k-64k", outputSampleRate: 32_000, bitRate: 64_000 },
  { id: "upsampled-48k-64k", outputSampleRate: 48_000, bitRate: 64_000 },
  { id: "current-48k-320k", outputSampleRate: 48_000, bitRate: 320_000 },
];

await mkdir(workRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });
const results = [];

for (const candidate of cases) {
  const runs = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const outputPath = path.join(workRoot, `${candidate.id}-${iteration}.wma`);
    try {
      const startedAt = performance.now();
      await runFfmpeg([
        "-y", "-stream_loop", "-1", "-i", source,
        "-t", String(durationSeconds), "-map", "0:a:0", "-vn", "-map_metadata", "-1",
        "-ar", String(candidate.outputSampleRate), "-ac", "1",
        "-c:a", "wmav2", "-b:a", String(candidate.bitRate), "-f", "asf", outputPath,
      ]);
      const elapsedSeconds = (performance.now() - startedAt) / 1_000;
      const probe = await probeAudio(outputPath);
      runs.push({
        iteration,
        elapsedSeconds,
        realtimeFactor: durationSeconds / elapsedSeconds,
        outputBytes: (await stat(outputPath)).size,
        outputSampleRate: Number(probe.stream.sample_rate),
        observedBitRate: Number(probe.format.bit_rate),
        durationSeconds: Number(probe.format.duration),
        asdrDb: await measureAsdr(outputPath),
      });
    } finally {
      await rm(outputPath, { force: true });
    }
  }
  results.push({ ...candidate, runs });
}

const report = {
  generatedAt: new Date().toISOString(),
  generatedBy: "scripts/benchmark-wma-speech-policy.mjs",
  source: path.relative(projectRoot, source),
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
      "-show_entries", "stream=codec_name,sample_rate,channels",
      "-show_entries", "format=bit_rate,duration", "-of", "json", outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  if (
    probe.streams?.length !== 1 ||
    probe.streams[0].codec_name !== "wmav2" ||
    probe.streams[0].channels !== 1
  ) {
    throw new Error(`Expected one mono WMA2 stream in ${outputPath}.`);
  }
  return { stream: probe.streams[0], format: probe.format };
}

async function measureAsdr(outputPath) {
  const trim = `atrim=duration=${qualityDurationSeconds},asetpts=PTS-STARTPTS`;
  const format = "aresample=16000,aformat=sample_fmts=fltp:sample_rates=16000:channel_layouts=mono";
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-stream_loop", "-1", "-i", source,
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
