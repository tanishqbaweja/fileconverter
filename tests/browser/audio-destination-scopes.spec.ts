import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, open, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validateScopedAudioTags } from "../../scripts/lib/scoped-audio-tag-validation.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const execute = promisify(execFile);
const chunkBytes = 65536, fixtureLimit = 1024 * 1024;
const tags = { title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf",
  genre: "Essai", date: "2026", track: "3/9", comment: "αβγ & <texte>" };
const sources = {
  wav: { extension: "wav", codec: "pcm_s16le", scope: "format" },
  flac: { extension: "flac", codec: "flac", scope: "format" },
  m4a: { extension: "m4a", codec: "alac", scope: "format" },
  ogg: { extension: "ogg", codec: "libvorbis", scope: "audio-stream" },
  opus: { extension: "opus", codec: "libopus", scope: "audio-stream" },
} as const;
const cases = [
  { source: "wav", destination: "ogg" }, { source: "wav", destination: "opus" },
  { source: "flac", destination: "ogg" }, { source: "flac", destination: "opus" },
  { source: "m4a", destination: "ogg" }, { source: "m4a", destination: "opus" },
  { source: "ogg", destination: "opus" }, { source: "opus", destination: "ogg" },
] as const;
test.use({ channel: process.env.WITHIN_BROWSER_CHANNEL || undefined });

async function native(executable: string, args: string[], directory: string) {
  return execute(executable, args, { cwd: root, windowsHide: true, timeout: 30000,
    maxBuffer: 65536, env: { ...process.env, TEMP: directory, TMP: directory, TMPDIR: directory } });
}
async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: chunkBytes })) hash.update(chunk);
  return hash.digest("hex");
}
async function probe(file: string, directory: string) {
  const { stdout } = await native("ffprobe", ["-v", "error", "-show_entries",
    "stream=index,codec_type,codec_name,sample_rate,channels:stream_tags:format=duration,format_name:format_tags",
    "-of", "json", file], directory);
  return JSON.parse(stdout);
}

for (const conversion of cases) {
  const profileId = `${conversion.source}-to-${conversion.destination}`;
  test(`M-08 explicit destination stream tags ${profileId}`, async ({ page, browser }) => {
    const disk = await statfs(root);
    expect(disk.bavail * disk.bsize).toBeGreaterThanOrEqual(8 * fixtureLimit);
    const work = path.join(root, "work");
    await mkdir(work, { recursive: true });
    const directory = await mkdtemp(path.join(work, "audio-destination-scopes-"));
    const source = sources[conversion.source];
    const input = path.join(directory, `fixture.${source.extension}`);
    const output = path.join(directory, `converted.${conversion.destination}`);
    const report: Record<string, unknown> = { recordedAt: new Date().toISOString(), profileId,
      browser: browser.version(), status: "failed-or-incomplete", runtimeDirectory: directory,
      scope: "Small genuine browser conversion; exact Unicode tag scopes and full independent decode only",
      completeChromiumMemoryAcceptance: false, lossyQualityAcceptance: false,
      artworkAcceptance: false, scalingAcceptance: false, publicAcceptance: false };
    let entryName: string | null = null;
    let conversionVerified = false;
    const pins: Record<string, string> = {};
    try {
      for (const file of ["tests/browser/audio-destination-scopes.spec.ts",
        "scripts/lib/scoped-audio-tag-validation.mjs", "scripts/lib/scoped-audio-tag-validation.d.mts",
        "public/engines/remux/within-remux.wasm"])
        pins[file] = await hashFile(path.join(root, file));
      report.sourcePins = pins;
      // Native FFmpeg generates only the deterministic input fixture.
      await native("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
        "sine=frequency=997:sample_rate=48000:duration=2", "-c:a", source.codec, "-threads", "1",
        ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
        "-fflags", "+bitexact", "-flags:a", "+bitexact", input], directory);
      const inputBytes = (await stat(input)).size;
      expect(inputBytes).toBeGreaterThan(0); expect(inputBytes).toBeLessThan(fixtureLimit);
      const inputProbe = await probe(input, directory);
      const inputTags = validateScopedAudioTags(inputProbe, tags, { scope: source.scope });
      report.source = { bytes: inputBytes, sha256: await hashFile(input), probe: inputProbe, tagValidation: inputTags };
      expect(inputTags.status, JSON.stringify(inputTags)).toBe("passed");

      await page.goto("/?test=1");
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      await page.locator('[data-testid="file-input"]').setInputFiles(input);
      await page.locator('[data-testid="format-select"]').selectOption(profileId);
      await expect(page.locator('[data-testid="convert-button"]')).toBeEnabled();
      await page.locator('[data-testid="convert-button"]').click();
      await page.waitForFunction(() => {
        const state = window.__WITHIN_TEST__?.getState().jobState;
        return state !== undefined && state !== "idle" && state !== "running";
      });
      const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
      entryName = state.opfsName;
      report.browserState = state;
      expect(state.jobState, state.error ?? state.phase).toBe("complete");
      expect(entryName).toBeTruthy(); expect(state.metrics).toBeTruthy();
      for (const value of [state.metrics!.maxReadChunkBytes, state.metrics!.maxWriteChunkBytes,
        state.metrics!.peakQueuedBytes]) expect(value).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics!.peakPendingOperations).toBeLessThanOrEqual(1);
      expect(state.metrics!.pendingOperations).toBe(0); expect(state.metrics!.queuedBytes).toBe(0);

      // Validation-only copy AFTER production OPFS output closes. Never collect
      // a whole output, including these small fixtures; one 64 KiB slice at a time.
      const outputBytes = await page.evaluate(async name => {
        const storage = await navigator.storage.getDirectory();
        return (await (await storage.getFileHandle(name)).getFile()).size;
      }, entryName!);
      expect(outputBytes).toBeGreaterThan(0); expect(outputBytes).toBeLessThan(fixtureLimit);
      const writer = await open(output, "wx");
      try {
        for (let offset = 0; offset < outputBytes; offset += chunkBytes) {
          const bytes = await page.evaluate(async ({ name, offset, count }) => {
            const storage = await navigator.storage.getDirectory();
            const file = await (await storage.getFileHandle(name)).getFile();
            return Array.from(new Uint8Array(await file.slice(offset, offset + count).arrayBuffer()));
          }, { name: entryName!, offset, count: Math.min(chunkBytes, outputBytes - offset) });
          const buffer = Buffer.from(bytes);
          expect(buffer.length).toBe(Math.min(chunkBytes, outputBytes - offset));
          let written = 0;
          while (written < buffer.length) {
            const result = await writer.write(buffer, written, buffer.length - written, offset + written);
            expect(result.bytesWritten).toBeGreaterThan(0); written += result.bytesWritten;
          }
        }
      } finally { await writer.close(); }
      expect((await stat(output)).size).toBe(outputBytes);
      const outputProbe = await probe(output, directory);
      const positive = validateScopedAudioTags(outputProbe, tags, { scope: "audio-stream" });
      const changed = validateScopedAudioTags(outputProbe, { title: "Changed title" }, { scope: "audio-stream" });
      const wrongScope = validateScopedAudioTags(outputProbe, tags, { scope: "format" });
      report.output = { bytes: outputBytes, sha256: await hashFile(output), probe: outputProbe,
        positive, changed, wrongScope };
      expect(positive.status, JSON.stringify(positive)).toBe("passed");
      expect(changed.status).toBe("failed"); expect(changed.fields[0].status).toBe("changed");
      expect(wrongScope.status).toBe("failed");
      expect(wrongScope.fields.every(field => field.status === "missing")).toBe(true);
      expect(outputProbe.streams).toHaveLength(1);
      expect(outputProbe.streams[0].codec_name).toBe(conversion.destination === "ogg" ? "vorbis" : "opus");
      expect(outputProbe.streams[0].sample_rate).toBe(inputProbe.streams[0].sample_rate);
      expect(outputProbe.streams[0].channels).toBe(inputProbe.streams[0].channels);
      expect(Math.abs(Number(outputProbe.format.duration) - Number(inputProbe.format.duration))).toBeLessThan(0.1);
      // Independent validator only; never the conversion implementation.
      await native("ffmpeg", ["-v", "error", "-xerror", "-i", output,
        "-map", "0:a:0", "-f", "null", "-"], directory);
      report.fullIndependentDecode = "passed";
      conversionVerified = true;
    } catch (error) {
      report.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try {
        const remaining = await page.evaluate(async outputName => {
          const storage = await navigator.storage.getDirectory();
          for await (const [name] of storage.entries())
            if (name === outputName || name.startsWith("within-")) await storage.removeEntry(name, { recursive: true });
          const names = [];
          for await (const [name] of storage.entries()) names.push(name);
          return names;
        }, entryName);
        report.remainingOpfsEntries = remaining;
        expect(remaining).toEqual([]);
        report.opfsCleanupVerified = true;
      } catch (error) {
        report.cleanupFailure = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        // Exact fresh mkdtemp identity only; never sweep other jobs or history.
        expect(path.dirname(directory)).toBe(work);
        expect(path.basename(directory).startsWith("audio-destination-scopes-")).toBe(true);
        await rm(directory, { recursive: true, force: true });
        await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
        report.ownedFixturesAndOutputsRemoved = true;
        const postPins: Record<string, string> = {};
        for (const file of Object.keys(pins)) postPins[file] = await hashFile(path.join(root, file));
        report.postSourcePins = postPins;
        const pinsUnchanged = Object.keys(pins).length === 4 &&
          Object.entries(pins).every(([file, hash]) => postPins[file] === hash);
        report.sourcePinsUnchanged = pinsUnchanged;
        if (conversionVerified && report.opfsCleanupVerified === true && pinsUnchanged)
          report.status = "passed-small-destination-scope-check";
        const reports = path.join(root, "output/playwright");
        await mkdir(reports, { recursive: true });
        const json = JSON.stringify(report, null, 2) + "\n";
        expect(Buffer.byteLength(json)).toBeLessThan(256 * 1024);
        await writeFile(path.join(reports, `audio-destination-scopes-${profileId}-${randomUUID()}.json`),
          json, { flag: "wx" });
        expect(pinsUnchanged, "Executed harness/validator/engine changed during the test").toBe(true);
      }
    }
  });
}
