import { execFile } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work");
const sourceMkv = path.join(projectRoot, "fixtures", "media", "av1-opus-source.mkv");
const sourceWebm = path.join(workRoot, "webm-audio-audit-source.webm");
const cases = [
  {
    output: "wav",
    codec: "pcm_s16le",
    format: "wav",
    arguments: ["-c:a", "pcm_s16le", "-f", "wav"],
  },
  {
    output: "flac",
    codec: "flac",
    format: "flac",
    arguments: ["-c:a", "flac", "-f", "flac"],
  },
  {
    output: "amr",
    codec: "amr_nb",
    format: "amr",
    arguments: ["-c:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1", "-b:a", "12.2k", "-f", "amr"],
    qualityFloorDb: -3,
  },
  {
    output: "mp3",
    codec: "mp3",
    format: "mp3",
    arguments: ["-c:a", "libmp3lame", "-ar", "48000", "-ac", "1", "-b:a", "128k", "-compression_level", "9", "-f", "mp3"],
    qualityFloorDb: -4,
  },
  {
    output: "aac",
    codec: "aac",
    format: "aac",
    arguments: ["-c:a", "aac", "-ar", "48000", "-ac", "1", "-b:a", "128k", "-aac_coder", "fast", "-aac_tns", "0", "-aac_pns", "0", "-aac_is", "0", "-aac_ms", "0", "-f", "adts"],
    qualityFloorDb: -6.5,
  },
];
const outputPaths = cases.map(({ output }) =>
  path.join(workRoot, `webm-audio-audit.${output}`),
);
const generatedPaths = [sourceWebm, ...outputPaths];

for (const target of generatedPaths) assertInside(workRoot, target);

try {
  await runFfmpeg([
    "-i", sourceMkv, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
    "-map_metadata", "0", "-f", "webm", sourceWebm,
  ]);

  const results = [];
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    const outputPath = outputPaths[index];
    const startedAt = performance.now();
    await runFfmpeg([
      "-i", sourceWebm, "-map", "0:a:0", "-vn", ...testCase.arguments,
      outputPath,
    ]);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-i", outputPath, "-map", "0:a:0", "-f", "null", "NUL"],
      processOptions(),
    );
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,profile,sample_rate,channels,bit_rate", "-show_entries", "format=format_name", "-of", "json", outputPath],
      processOptions(),
    );
    const probe = JSON.parse(stdout);
    const audio = probe.streams?.[0];
    const expectedRate = testCase.output === "amr" ? 8000 : 48000;
    if (
      audio?.codec_name !== testCase.codec ||
      Number(audio?.sample_rate) !== expectedRate ||
      Number(audio?.channels) !== 1 ||
      !String(probe.format?.format_name).split(",").includes(testCase.format)
    ) {
      throw new Error(`Unexpected ${testCase.output.toUpperCase()} probe: ${stdout}`);
    }
    if (testCase.output === "wav" || testCase.output === "flac") {
      await assertPsnr(sourceWebm, outputPath, 60);
    } else {
      await assertQuality(sourceWebm, outputPath, expectedRate, testCase.qualityFloorDb);
    }
    results.push({
      output: testCase.output,
      seconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
      bytes: (await stat(outputPath)).size,
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate),
      channels: Number(audio.channels),
      bitrate: Number(audio.bit_rate) || null,
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await Promise.all(generatedPaths.map((target) => rm(target, { force: true })));
}

async function assertQuality(sourcePath, outputPath, sampleRate, floorDb) {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", sourcePath, "-i", outputPath,
      "-filter_complex",
      `[0:a:0]aresample=${sampleRate}:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono[source];[1:a:0]aresample=${sampleRate}:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono[converted];[source][converted]asdr[quality]`,
      "-map", "[quality]", "-f", "null", "NUL",
    ],
    processOptions(),
  );
  const values = [...stderr.matchAll(/SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi)]
    .map((match) => Number(match[1]));
  if (values.length === 0 || Math.min(...values) < floorDb) {
    throw new Error(`Quality validation failed at ${values.join(", ") || "no result"} dB.`);
  }
}

async function assertPsnr(sourcePath, outputPath, floorDb) {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", sourcePath, "-i", outputPath,
      "-filter_complex",
      "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]apsnr[quality]",
      "-map", "[quality]", "-f", "null", "NUL",
    ],
    processOptions(),
  );
  const values = [...stderr.matchAll(/PSNR ch\d+:\s+(inf|[+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi)]
    .map((match) => match[1].toLowerCase() === "inf" ? Number.POSITIVE_INFINITY : Number(match[1]));
  if (values.length === 0 || Math.min(...values) < floorDb) {
    throw new Error(`PSNR validation failed at ${values.join(", ") || "no result"} dB.`);
  }
}

async function runFfmpeg(arguments_) {
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...arguments_],
    processOptions(),
  );
}

function processOptions() {
  return { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
}

function assertInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project audit path: ${target}`);
  }
}
