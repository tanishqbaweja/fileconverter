import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { validateScopedAudioTags } from "../../scripts/lib/scoped-audio-tag-validation.mjs";

const root = path.resolve(import.meta.dirname, "../.."), execute = promisify(execFile);
const tags = {
  title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf", genre: "Essai",
  date: "2026", track: "3/9", comment: "αβγ & <texte>", composer: "作曲者 Émile",
  album_artist: "Artiste collectif", performer: "Violon — 藝術家", disc: "2/3", copyright: "© 2026 Example",
  publisher: "Éditions locales", language: "fra", isrc: "FR9ZZ2600001", encoded_by: "Deterministic fixture",
  lyrics: "Un vers\n第二行", license: "Licence d’essai", contact: "Contact local", location: "Montréal",
  organization: "Atelier α", custom_field: "Valeur libre 音楽", replaygain_track_gain: "-5.25 dB",
  replaygain_track_peak: "0.800000", replaygain_album_gain: "-4.00 dB",
};
const cases = [
  { source: "flac", destination: "ogg" }, { source: "flac", destination: "opus" },
  { source: "ogg", destination: "opus" }, { source: "opus", destination: "ogg" },
  { source: "ogg", destination: "flac" }, { source: "opus", destination: "flac" },
] as const;
const codecs = { flac: "flac", ogg: "libvorbis", opus: "libopus" };
test.use({ channel: "chrome", headless: true });

async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 65536 })) hash.update(bytes);
  return hash.digest("hex");
}

for (const conversion of cases) {
  const profileId = `${conversion.source}-to-${conversion.destination}`;
  test(`M-08 expanded metadata ${profileId}`, async ({ page, browser, baseURL }) => {
    const runtime = await createOwnedRuntimeScratch("audio-expanded-metadata-");
    const input = path.join(runtime.directory, "source." + conversion.source);
    const output = path.join(runtime.directory, "output." + conversion.destination);
    const native = (args: string[], executable = "ffmpeg") => execute(executable, args,
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 131072 });
    const probe = async (file: string) => JSON.parse((await native(["-v", "error", "-show_entries",
      "stream=index,codec_type,codec_name,sample_rate,channels:stream_tags:format=duration:format_tags", "-of", "json", file], "ffprobe")).stdout);
    const report: Record<string, unknown> = { startedAt: new Date().toISOString(), status: "failed-or-incomplete", profileId,
      scope: "25-field small real production-browser metadata check, not full preservation/quality/memory acceptance",
      browser: browser.version(), publicAcceptance: false, fullMetadataAcceptance: false, memoryAcceptance: false,
      artworkAcceptance: false, scalingAcceptance: false, headedCoverage: false, runtimeDirectory: runtime.directory };
    const forbidden: string[] = [], pins: Record<string, string> = {};
    let entryName: string | null = null, verified = false, cleanupVerified = false;
    page.on("request", request => {
      if (/^https?:/.test(request.url()) && (!request.url().startsWith(new URL(baseURL!).origin + "/") ||
          request.method() !== "GET" || request.postData() !== null)) {
        if (forbidden.length < 16) forbidden.push(request.url().slice(0, 256));
      }
    });
    try {
      for (const file of ["tests/browser/audio-expanded-metadata.spec.ts", "scripts/lib/scoped-audio-tag-validation.mjs",
        "media/ffmpeg/within_remux.c", "public/engines/remux/within-remux.mjs", "public/engines/remux/within-remux.wasm"])
        pins[file] = await hashFile(path.join(root, file));
      report.sourcePins = pins;
      // Fixture generation only. All conversion below goes through the app UI.
      await native(["-v", "error", "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2",
        "-c:a", codecs[conversion.source], "-threads", "1", ...Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
        "-fflags", "+bitexact", "-flags:a", "+bitexact", input]);
      const inputProbe = await probe(input), sourceTags = validateScopedAudioTags(inputProbe, tags,
        { scope: conversion.source === "flac" ? "format" : "audio-stream" });
      report.source = { bytes: (await stat(input)).size, sha256: await hashFile(input), probe: inputProbe, tags: sourceTags };
      expect((await stat(input)).size).toBeLessThan(1024 * 1024);
      expect(sourceTags.status, JSON.stringify(sourceTags)).toBe("passed");

      await page.goto("/?test=1");
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      await page.locator('[data-testid="file-input"]').setInputFiles(input);
      await page.locator('[data-testid="format-select"]').selectOption(profileId);
      await expect(page.locator('[data-testid="convert-button"]')).toBeEnabled();
      await page.locator('[data-testid="convert-button"]').click();
      await page.waitForFunction(() => ["complete", "error", "cancelled"].includes(window.__WITHIN_TEST__?.getState().jobState ?? ""));
      const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState()); entryName = state.opfsName;
      report.browserState = state;
      expect(state.jobState, state.error ?? state.phase).toBe("complete"); expect(entryName).toBeTruthy();
      for (const count of [state.metrics!.maxReadChunkBytes, state.metrics!.maxWriteChunkBytes, state.metrics!.peakQueuedBytes]) expect(count).toBeLessThanOrEqual(262144);
      expect(state.metrics!.peakPendingOperations).toBeLessThanOrEqual(1); expect(state.metrics!.pendingOperations).toBe(0);
      const outputSize = await page.evaluate(async name => (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).size, entryName!);
      expect(outputSize).toBeGreaterThan(0); expect(outputSize).toBeLessThan(1024 * 1024);
      const writer = await open(output, "wx");
      try {
        for (let offset = 0; offset < outputSize; offset += 65536) {
          const count = Math.min(65536, outputSize - offset);
          const bytes = await page.evaluate(async ({ name, offset, count }) => {
            const file = await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile();
            return Array.from(new Uint8Array(await file.slice(offset, offset + count).arrayBuffer()));
          }, { name: entryName!, offset, count });
          const buffer = Buffer.from(bytes); expect(buffer.length).toBe(count);
          let written = 0;
          while (written < buffer.length) { const result = await writer.write(buffer, written, buffer.length - written, offset + written);
            expect(result.bytesWritten).toBeGreaterThan(0); written += result.bytesWritten; }
        }
      } finally { await writer.close(); }
      const outputProbe = await probe(output), outputTags = validateScopedAudioTags(outputProbe, tags,
        { scope: conversion.destination === "flac" ? "format" : "audio-stream" });
      report.output = { bytes: outputSize, sha256: await hashFile(output), probe: outputProbe, tags: outputTags };
      // Decode and codec checks still execute before a metadata assertion fails.
      expect(outputProbe.streams).toHaveLength(1);
      expect(outputProbe.streams[0].codec_name).toBe(conversion.destination === "ogg" ? "vorbis" : conversion.destination);
      await native(["-v", "error", "-xerror", "-i", output, "-map", "0:a:0", "-f", "null", "-"]);
      report.fullIndependentDecode = true;
      expect(forbidden).toEqual([]); report.forbiddenRequests = forbidden;
      expect(outputTags.status, JSON.stringify(outputTags)).toBe("passed");
      const negative = validateScopedAudioTags(outputProbe, { custom_field: "Changed" },
        { scope: conversion.destination === "flac" ? "format" : "audio-stream" });
      expect(negative.status).toBe("failed"); report.changedValueControl = negative;
      verified = true;
    } catch (error) { report.failure = String(error); throw error; }
    finally {
      try {
        if (page.url().startsWith(new URL(baseURL!).origin)) {
          const remaining = await page.evaluate(async name => {
            const storage = await navigator.storage.getDirectory();
            for await (const [key] of storage.entries()) if (key === name || key.startsWith("within-")) await storage.removeEntry(key, { recursive: true });
            const entries = []; for await (const [key] of storage.entries()) entries.push(key); return entries;
          }, entryName);
          expect(remaining).toEqual([]); report.remainingOpfsEntries = remaining;
        }
        await runtime.close(); cleanupVerified = true; report.disposableFixturesOutputsScratchRemoved = true;
      } finally {
        // Close owned scratch even if browser storage cleanup failed.
        await runtime.close();
        const postPins: Record<string, string> = {};
        for (const file of Object.keys(pins)) postPins[file] = await hashFile(path.join(root, file));
        report.postSourcePins = postPins; const pinsUnchanged = Object.keys(pins).length === 5 && Object.entries(pins).every(([file, hash]) => postPins[file] === hash);
        report.sourcePinsUnchanged = pinsUnchanged;
        if (verified && cleanupVerified && pinsUnchanged) report.status = "passed-small-expanded-metadata-check";
        report.finishedAt = new Date().toISOString();
        await mkdir(path.join(root, "output/playwright"), { recursive: true });
        const json = JSON.stringify(report, null, 2) + "\n"; expect(Buffer.byteLength(json)).toBeLessThan(262144);
        await writeFile(path.join(root, `output/playwright/audio-expanded-metadata-${profileId}-${randomUUID()}.json`), json, { flag: "wx" });
        expect(pinsUnchanged).toBe(true);
      }
    }
  });
}
