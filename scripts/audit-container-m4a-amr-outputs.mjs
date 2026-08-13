import { execFile } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work");
const amrSource = path.join(projectRoot, "fixtures", "media", "audio-source.amr");
const aviSource = path.join(projectRoot, "fixtures", "media", "legacy-video-source.avi");
const ogvSource = path.join(projectRoot, "fixtures", "media", "theora-video-source.ogv");
const av1OpusSource = path.join(projectRoot, "fixtures", "media", "av1-opus-source.mkv");
const threeGpSource = path.join(workRoot, "container-audio-audit-amr.3gp");
const webmSource = path.join(workRoot, "container-audio-audit-opus.webm");
const amrOutput = path.join(workRoot, "container-audio-audit-3gp.amr");
const m4aCases = [
  { input: "avi", source: aviSource },
  { input: "ogv", source: ogvSource },
  { input: "webm", source: webmSource },
].map((testCase) => ({
  ...testCase,
  output: path.join(workRoot, `container-audio-audit-${testCase.input}.m4a`),
}));
const generatedPaths = [
  threeGpSource,
  webmSource,
  amrOutput,
  ...m4aCases.map(({ output }) => output),
];

for (const target of generatedPaths) assertInside(workRoot, target);

try {
  await Promise.all([
    runFfmpeg(["-i", amrSource, "-map", "0:a:0", "-c:a", "copy", "-f", "3gp", threeGpSource]),
    runFfmpeg(["-i", av1OpusSource, "-map", "0", "-c", "copy", "-f", "webm", webmSource]),
  ]);

  const results = [];
  let startedAt = performance.now();
  await runFfmpeg([
    "-i", threeGpSource, "-map", "0:a:0", "-vn", "-sn", "-dn",
    "-c:a", "copy", "-f", "amr", amrOutput,
  ]);
  await assertDecodes(amrOutput);
  const amrProbe = await probeAudio(amrOutput);
  if (
    amrProbe.audio?.codec_name !== "amr_nb" ||
    Number(amrProbe.audio?.sample_rate) !== 8000 ||
    Number(amrProbe.audio?.channels) !== 1 ||
    !String(amrProbe.format?.format_name).split(",").includes("amr")
  ) {
    throw new Error(`Unexpected 3gp-to-amr probe: ${JSON.stringify(amrProbe)}`);
  }
  const [sourcePacketHash, outputPacketHash] = await Promise.all([
    packetHash(threeGpSource),
    packetHash(amrOutput),
  ]);
  if (sourcePacketHash !== outputPacketHash) {
    throw new Error(`AMR packet-copy mismatch: ${sourcePacketHash} != ${outputPacketHash}`);
  }
  results.push({
    route: "3gp-to-amr",
    seconds: elapsedSeconds(startedAt),
    bytes: (await stat(amrOutput)).size,
    codec: "amr_nb",
    sampleRate: 8000,
    channels: 1,
    packetSha256: outputPacketHash,
  });

  for (const testCase of m4aCases) {
    startedAt = performance.now();
    await runFfmpeg([
      "-i", testCase.source, "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-c:a", "aac", "-b:a", "128k", "-aac_coder", "fast",
      "-aac_tns", "0", "-aac_pns", "0", "-aac_is", "0", "-aac_ms", "0",
      "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
      "-f", "ipod", testCase.output,
    ]);
    await assertDecodes(testCase.output);
    const probe = await probeAudio(testCase.output);
    if (
      probe.audio?.codec_name !== "aac" ||
      Number(probe.audio?.sample_rate) <= 0 ||
      Number(probe.audio?.sample_rate) > 48000 ||
      Number(probe.audio?.channels) < 1 ||
      Number(probe.audio?.channels) > 2 ||
      !String(probe.format?.format_name).split(",").includes("mov")
    ) {
      throw new Error(`Unexpected ${testCase.input}-to-m4a probe: ${JSON.stringify(probe)}`);
    }
    await assertQuality(testCase.source, testCase.output, -6.5);
    results.push({
      route: `${testCase.input}-to-m4a`,
      seconds: elapsedSeconds(startedAt),
      bytes: (await stat(testCase.output)).size,
      codec: probe.audio.codec_name,
      sampleRate: Number(probe.audio.sample_rate),
      channels: Number(probe.audio.channels),
      bitrate: Number(probe.audio.bit_rate) || Number(probe.format?.bit_rate) || null,
    });
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await Promise.all(generatedPaths.map((target) => rm(target, { force: true })));
}

async function probeAudio(inputPath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,profile,sample_rate,channels,bit_rate",
      "-show_entries", "format=format_name,duration,size,bit_rate", "-of", "json", inputPath,
    ],
    processOptions(),
  );
  const probe = JSON.parse(stdout);
  return { audio: probe.streams?.[0], format: probe.format };
}

async function packetHash(inputPath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-i", inputPath,
      "-map", "0:a:0", "-c:a", "copy", "-f", "hash", "-hash", "sha256", "-",
    ],
    processOptions(),
  );
  const match = stdout.match(/SHA256=([0-9a-f]{64})/i);
  if (!match) throw new Error(`Missing packet hash for ${inputPath}.`);
  return match[1].toLowerCase();
}

async function assertDecodes(inputPath) {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-xerror", "-nostdin",
      "-i", inputPath, "-map", "0:a:0", "-f", "null", "NUL",
    ],
    processOptions(),
  );
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

function elapsedSeconds(startedAt) {
  return Number(((performance.now() - startedAt) / 1000).toFixed(2));
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
