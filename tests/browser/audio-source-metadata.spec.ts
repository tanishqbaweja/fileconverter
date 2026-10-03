import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const workRoot = path.join(projectRoot, "work", "audio-source-metadata-validation");
const reportPath = path.join(projectRoot, "output/playwright/audio-source-metadata.json");
const execFileAsync = promisify(execFile);
const commonTags = {
  title: "Titre café — 音楽",
  artist: "Émile / कलाकार",
  album: "Album naïf",
  genre: "Essai",
  date: "2026",
  track: "3/9",
  comment: "Commentaire: αβγ & <texte>",
};
const aiffTags = {
  title: commonTags.title,
  author: "Auteur Émile",
  comment: commonTags.comment,
  copyright: "Copyright © 2026",
};
const sources = {
  wav: { extension: "wav", codec: "pcm_s16le", options: [] },
  wma: { extension: "wma", codec: "wmav2", options: ["-b:a", "128k"] },
  aiff: { extension: "aiff", codec: "pcm_s16be", options: [] },
  alac: { extension: "m4a", codec: "alac", options: [] },
  mp3: { extension: "mp3", codec: "libmp3lame", options: ["-b:a", "128k"] },
  flac: { extension: "flac", codec: "flac", options: [] },
} as const;
type SourceId = keyof typeof sources;
const cases: Array<{
  source: SourceId; profileId: string; extension: string; codec: string; lossless: boolean;
}> = [
  { source: "wav", profileId: "wav-to-flac", extension: "flac", codec: "flac", lossless: true },
  { source: "wma", profileId: "wma-to-flac", extension: "flac", codec: "flac", lossless: true },
  { source: "aiff", profileId: "aiff-to-flac", extension: "flac", codec: "flac", lossless: true },
  { source: "alac", profileId: "m4a-to-flac", extension: "flac", codec: "flac", lossless: true },
  { source: "mp3", profileId: "mp3-to-flac", extension: "flac", codec: "flac", lossless: true },
  { source: "flac", profileId: "flac-to-wav", extension: "wav", codec: "pcm_s16le", lossless: true },
  { source: "flac", profileId: "flac-to-alac", extension: "m4a", codec: "alac", lossless: true },
  { source: "flac", profileId: "flac-to-wma", extension: "wma", codec: "wmav2", lossless: false },
  { source: "wav", profileId: "wav-to-alac", extension: "m4a", codec: "alac", lossless: true },
];
const results: Array<Record<string, unknown>> = [];

test.use({ channel: process.env.WITHIN_BROWSER_CHANNEL || undefined });

async function native(args: string[], executable = "ffmpeg") {
  return execFileAsync(executable, args, {
    cwd: projectRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  });
}

async function probe(filePath: string) {
  const { stdout } = await native([
    "-v", "error", "-show_entries",
    "stream=codec_name,codec_type,sample_rate,channels:format=duration:format_tags",
    "-of", "json", filePath,
  ], "ffprobe");
  return JSON.parse(stdout) as {
    streams: Array<{ codec_name: string; codec_type: string; sample_rate: string; channels: number }>;
    format: { duration: string; tags?: Record<string, string> };
  };
}

async function decodedHash(filePath: string, decoderOptions: string[] = []) {
  const { stdout } = await native([
    "-v", "error", ...decoderOptions, "-i", filePath, "-map", "0:a:0", "-c:a", "pcm_s16le",
    "-f", "hash", "-hash", "sha256", "pipe:1",
  ]);
  const digest = /SHA256=([0-9a-f]{64})/i.exec(stdout)?.[1];
  if (!digest) throw new Error(`Missing independent decoded PCM hash: ${stdout}`);
  return digest;
}

async function decodedSamples(filePath: string, decoderOptions: string[] = []) {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-v", "error", ...decoderOptions, "-i", filePath, "-map", "0:a:0",
    "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1",
  ], { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024, encoding: "buffer" });
  return stdout;
}

function sampleDifference(source: Buffer, output: Buffer) {
  let peakAbsoluteDifference = 0;
  let differingSamples = 0;
  let squaredError = 0;
  for (let offset = 0; offset < Math.min(source.length, output.length); offset += 2) {
    const difference = Math.abs(source.readInt16LE(offset) - output.readInt16LE(offset));
    peakAbsoluteDifference = Math.max(peakAbsoluteDifference, difference);
    if (difference !== 0) differingSamples++;
    squaredError += difference * difference;
  }
  return {
    sourceSamples: source.length / 2, outputSamples: output.length / 2,
    differingSamples, peakAbsoluteDifference,
    rmsDifference: Math.sqrt(squaredError / (Math.min(source.length, output.length) / 2)),
  };
}

async function fileEvidence(filePath: string) {
  return {
    bytes: (await stat(filePath)).size,
    sha256: createHash("sha256").update(await readFile(filePath)).digest("hex"),
  };
}

test.beforeAll(async () => {
  await mkdir(workRoot, { recursive: true });
  for (const [id, source] of Object.entries(sources)) {
    const tags = id === "aiff" ? aiffTags : commonTags;
    await native([
      "-v", "error", "-y", "-f", "lavfi", "-i",
      "sine=frequency=997:sample_rate=48000:duration=2",
      "-c:a", source.codec, ...source.options,
      ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
      "-fflags", "+bitexact", "-flags:a", "+bitexact",
      path.join(workRoot, `source-${id}.${source.extension}`),
    ]);
  }
});

test.afterAll(async () => {
  try {
    await mkdir(path.dirname(reportPath), { recursive: true });
    // Playwright restarts its worker after a failed test. Preserve preceding
    // worker results rather than overwriting the evidence with the last worker.
    const prior = JSON.parse(await readFile(reportPath, "utf8").catch(() => '{"cases":[]}')) as { cases: Array<Record<string, unknown>> };
    const merged = new Map(prior.cases.map((row) => [row.profileId, row]));
    for (const row of results) merged.set(row.profileId, row);
    await writeFile(reportPath, `${JSON.stringify({
      recordedAt: new Date().toISOString(),
      scope: "Small production-browser source-container Unicode tag mappings; not a memory/stress certification",
      cases: [...merged.values()],
    }, null, 2)}\n`);
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
});

for (const conversion of cases) {
  test(`M-08 Unicode source mapping ${conversion.source} via ${conversion.profileId}`, async ({ page, browser }) => {
    const source = sources[conversion.source];
    const inputPath = path.join(workRoot, `source-${conversion.source}.${source.extension}`);
    const outputPath = path.join(workRoot, `${conversion.profileId}.${conversion.extension}`);
    const expectedTags = conversion.source === "aiff" ? aiffTags : commonTags;
    const inputProbe = await probe(inputPath);
    for (const [key, value] of Object.entries(expectedTags)) {
      expect(inputProbe.format.tags?.[key], `fixture/${key}`).toBe(value);
    }
    let entryName: string | null = null;
    try {
      await page.goto("/?test=1");
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      await page.locator('[data-testid="file-input"]').setInputFiles(inputPath);
      await page.locator('[data-testid="format-select"]').selectOption(conversion.profileId);
      await expect(page.locator('[data-testid="convert-button"]')).toBeEnabled();
      await page.locator('[data-testid="convert-button"]').click();
      await page.waitForFunction(() => {
        const state = window.__WITHIN_TEST__?.getState().jobState;
        return state !== undefined && state !== "idle" && state !== "running";
      });
      const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
      entryName = state.opfsName;
      expect(state.jobState, state.error ?? state.phase).toBe("complete");
      expect(entryName).toBeTruthy();
      expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
      expect(state.metrics?.pendingOperations).toBe(0);
      expect(state.metrics?.queuedBytes).toBe(0);

      // Validation-only transfer of a <1 MiB fixture output. The production
      // writer has already completed into OPFS; this is not conversion I/O.
      const bytes = await page.evaluate(async (name) => {
        const root = await navigator.storage.getDirectory();
        const file = await (await root.getFileHandle(name)).getFile();
        if (file.size > 1024 * 1024) throw new Error("Validation fixture output exceeded 1 MiB.");
        return Array.from(new Uint8Array(await file.arrayBuffer()));
      }, entryName!);
      await writeFile(outputPath, Buffer.from(bytes));
      const outputProbe = await probe(outputPath);
      // Match the independent reference to the Wasm decoder implementation:
      // fixed-point MP3 rather than native FFmpeg's default mp3float, and
      // scalar WMA rather than host SIMD. Both remain exact PCM hash checks.
      const decoderOptions = conversion.source === "mp3" ? ["-c:a", "mp3"]
        : conversion.source === "wma" ? ["-cpuflags", "0"] : [];
      const sourcePcm = await decodedHash(inputPath, decoderOptions);
      const outputPcm = await decodedHash(outputPath);
      const [inputSamples, outputSamples] = await Promise.all([
        decodedSamples(inputPath), decodedSamples(outputPath),
      ]);
      const decoderComparison = conversion.source === "mp3"
        ? sampleDifference(await decodedSamples(inputPath, ["-c:a", "mp3"]), outputSamples)
        : conversion.source === "wma"
          ? sampleDifference(await decodedSamples(inputPath, ["-cpuflags", "0"]), outputSamples)
          : null;
      const outputTags = outputProbe.format.tags ?? {};
      const missingTags = Object.entries(expectedTags).filter(([key, value]) => outputTags[key] !== value).map(([key]) => key);
      results.push({
        ...conversion, browser: browser.version(),
        source: { id: conversion.source, ...await fileEvidence(inputPath), tags: inputProbe.format.tags, pcmSha256: sourcePcm },
        output: { ...await fileEvidence(outputPath), tags: outputTags, pcmSha256: outputPcm, streams: outputProbe.streams, duration: outputProbe.format.duration },
        missingTags, warnings: state.warnings, metrics: state.metrics,
        sampleDifference: sampleDifference(inputSamples, outputSamples),
        decoderOptions, decoderComparison,
      });
      expect(outputProbe.streams).toHaveLength(1);
      expect(outputProbe.streams[0].codec_name).toBe(conversion.codec);
      expect(outputProbe.streams[0].sample_rate).toBe(inputProbe.streams[0].sample_rate);
      expect(outputProbe.streams[0].channels).toBe(inputProbe.streams[0].channels);
      expect(Math.abs(Number(outputProbe.format.duration) - Number(inputProbe.format.duration))).toBeLessThan(0.1);
      expect(missingTags, JSON.stringify(outputTags)).toEqual([]);
      if (conversion.lossless) expect(outputPcm).toBe(sourcePcm);
    } finally {
      try {
        await page.evaluate(async (outputName) => {
          const root = await navigator.storage.getDirectory();
          for await (const [name] of root.entries()) {
            if (name === outputName || name.startsWith("within-")) await root.removeEntry(name, { recursive: true });
          }
          const remaining = [];
          for await (const [name] of root.entries()) remaining.push(name);
          return remaining;
        }, entryName).then((remaining) => expect(remaining).toEqual([]));
      } finally {
        await rm(outputPath, { force: true });
      }
    }
  });
}
