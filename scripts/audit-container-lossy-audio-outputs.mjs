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
  ["mp4", "mp4"],
  ["mov", "mov"],
  ["mpeg-ts", "mpegts"],
  ["flv", "flv"],
].map(([input, format]) => ({
  input,
  format,
  path: path.join(workRoot, `container-lossy-audit-source.${input === "mpeg-ts" ? "mpegts" : input}`),
}));
const cases = [
  ...containerSources.map((source) => ({ ...source, output: "opus" })),
  { input: "avi", path: aviSource, output: "opus" },
  { input: "ogv", path: ogvSource, output: "opus" },
  ...containerSources.map((source) => ({ ...source, output: "ogg" })),
  { input: "avi", path: aviSource, output: "ogg" },
  { input: "ogv", path: ogvSource, output: "mp3" },
];
const outputPaths = cases.map(({ input, output }) =>
  path.join(workRoot, `container-lossy-audit-${input}.${output}`),
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
        "-i", mobileSource, "-map", "0:v:0", "-map", "0:a:0",
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
    const encoderArguments = testCase.output === "mp3"
      ? [
          "-c:a", "libmp3lame", "-ar", "48000", "-ac", "1",
          "-b:a", "128k", "-compression_level", "9", "-f", "mp3",
        ]
      : testCase.output === "opus"
        ? [
            "-c:a", "libopus", "-ar", "48000", "-ac", "1", "-b:a", "64k",
            "-application", "audio", "-compression_level", "0", "-vbr", "on",
            "-f", "opus",
          ]
        : ["-c:a", "libvorbis", "-ar", "48000", "-ac", "1", "-q:a", "4", "-f", "ogg"];
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
        "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate",
        "-show_entries", "format=format_name,bit_rate", "-of", "json", outputPath,
      ],
      processOptions(),
    );
    const probe = JSON.parse(stdout);
    const audio = probe.streams?.[0];
    const expectedCodec = testCase.output === "ogg" ? "vorbis" : testCase.output;
    const expectedFormat = testCase.output === "mp3" ? "mp3" : "ogg";
    if (
      audio?.codec_name !== expectedCodec ||
      Number(audio?.sample_rate) !== 48000 ||
      Number(audio?.channels) !== 1 ||
      !String(probe.format?.format_name).split(",").includes(expectedFormat)
    ) {
      throw new Error(`Unexpected ${testCase.input}-to-${testCase.output} probe: ${stdout}`);
    }
    await assertQuality(
      testCase.path,
      outputPath,
      testCase.output === "mp3" ? -4 : -6.5,
    );
    results.push({
      route: `${testCase.input}-to-${testCase.output}`,
      seconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
      bytes: (await stat(outputPath)).size,
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate),
      channels: Number(audio.channels),
      bitrate: Number(audio.bit_rate) || Number(probe.format?.bit_rate) || null,
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await Promise.all(generatedPaths.map((target) => rm(target, { force: true })));
}

async function assertQuality(sourcePath, outputPath, floorDb) {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", sourcePath, "-i", outputPath,
      "-filter_complex",
      "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]asdr[quality]",
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
