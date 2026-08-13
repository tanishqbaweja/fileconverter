import { execFile } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work");
const mobileSource = path.join(projectRoot, "fixtures", "media", "mobile-video-source.3gp");
const aviSource = path.join(projectRoot, "fixtures", "media", "legacy-video-source.avi");
const ogvSource = path.join(projectRoot, "fixtures", "media", "theora-video-source.ogv");
const containerSources = [
  ["mkv", "matroska"],
  ["mp4", "mp4"],
  ["mov", "mov"],
  ["mpegts", "mpegts"],
  ["flv", "flv"],
].map(([extension, format]) => ({
  input: extension === "mpegts" ? "mpeg-ts" : extension,
  format,
  path: path.join(workRoot, `container-audio-audit-source.${extension}`),
}));
const cases = [
  ...containerSources.map((source) => ({ ...source, output: "amr" })),
  { input: "avi", path: aviSource, output: "amr" },
  { input: "ogv", path: ogvSource, output: "amr" },
  { input: "avi", path: aviSource, output: "aac" },
  { input: "ogv", path: ogvSource, output: "aac" },
];
const outputPaths = cases.map(({ input, output }) =>
  path.join(workRoot, `container-audio-audit-${input}.${output}`),
);
const generatedPaths = [
  ...containerSources.map(({ path: sourcePath }) => sourcePath),
  ...outputPaths,
];

for (const target of generatedPaths) assertInside(workRoot, target);

try {
  await Promise.all(
    containerSources.map(({ format, path: outputPath }) =>
      runFfmpeg([
        "-i", mobileSource,
        "-map", "0:v:0", "-map", "0:a:0",
        "-c", "copy", "-map_metadata", "0", "-fflags", "+bitexact",
        "-f", format, outputPath,
      ]),
    ),
  );

  const results = [];
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    const outputPath = outputPaths[index];
    const startedAt = performance.now();
    const encoderArguments = testCase.output === "amr"
      ? [
          "-c:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1",
          "-b:a", "12.2k", "-f", "amr",
        ]
      : [
          "-c:a", "aac", "-ar", "48000", "-ac", "1", "-b:a", "128k",
          "-aac_coder", "fast", "-aac_tns", "0", "-aac_pns", "0",
          "-aac_is", "0", "-aac_ms", "0", "-f", "adts",
        ];
    await runFfmpeg([
      "-i", testCase.path, "-map", "0:a:0", "-vn",
      ...encoderArguments, outputPath,
    ]);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-xerror", "-nostdin",
        "-i", outputPath, "-map", "0:a:0", "-f", "null", "NUL",
      ],
      processOptions(),
    );
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,profile,sample_rate,channels,bit_rate",
        "-show_entries", "format=format_name", "-of", "json", outputPath,
      ],
      processOptions(),
    );
    const probe = JSON.parse(stdout);
    const audio = probe.streams?.[0];
    const expectedCodec = testCase.output === "amr" ? "amr_nb" : "aac";
    const expectedFormat = testCase.output === "amr" ? "amr" : "aac";
    const expectedRate = testCase.output === "amr" ? 8000 : 48000;
    if (
      audio?.codec_name !== expectedCodec ||
      Number(audio?.sample_rate) !== expectedRate ||
      Number(audio?.channels) !== 1 ||
      !String(probe.format?.format_name).split(",").includes(expectedFormat)
    ) {
      throw new Error(`Unexpected ${testCase.input}-to-${testCase.output} probe: ${stdout}`);
    }
    await assertQuality(
      testCase.path,
      outputPath,
      expectedRate,
      testCase.output === "amr" ? -3 : -6.5,
    );
    results.push({
      route: `${testCase.input}-to-${testCase.output}`,
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
  const values = [
    ...stderr.matchAll(/SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi),
  ].map((match) => Number(match[1]));
  if (values.length === 0 || Math.min(...values) < floorDb) {
    throw new Error(`Quality validation failed at ${values.join(", ") || "no result"} dB.`);
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
