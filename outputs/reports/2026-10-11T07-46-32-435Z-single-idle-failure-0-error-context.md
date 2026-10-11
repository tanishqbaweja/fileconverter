# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: candidate.spec.ts >> private split MPEG2 propagates direct output write failure and removes partial output
- Location: work\encoder-plane-recovery-diagnostic-SixGup\candidate.spec.ts:546:1

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 1
Received length: 0
Received array:  []
```

# Test source

```ts
  421 |         actualVideoEncoderTag: afterVideo.tags?.encoder });
  422 |       const audio = after.streams.filter((stream) => stream.codec_type === "audio");
  423 |       expect(audio.map((stream) => stream.codec_name)).toEqual(["aac", "aac"]);
  424 |       expect(audio.map((stream) => stream.tags?.language)).toEqual(["eng", "hin"]);
  425 |       expect(await audioHashes(output)).toEqual(await audioHashes(source));
  426 |       expect(after.format.tags.title).toBe(before.format.tags.title);
  427 |       const normalizedTags = (tags: Record<string, string>) => Object.fromEntries(
  428 |         Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
  429 |       const beforeTags = normalizedTags(before.format.tags), afterTags = normalizedTags(after.format.tags);
  430 |       expect(afterTags.website).toBe(beforeTags.website);
  431 |       expect(afterTags["custom_音楽"]).toBe(beforeTags["custom_音楽"]);
  432 |       expect(after.chapters).toHaveLength(1);
  433 |       expect(after.chapters[0].tags.title).toBe(before.chapters[0].tags.title);
  434 |       expect(Number(after.chapters[0].start_time)).toBeCloseTo(Number(before.chapters[0].start_time), 3);
  435 |       expect(Number(after.chapters[0].end_time)).toBeCloseTo(Number(before.chapters[0].end_time), 3);
  436 |       await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v:0", "-map", "0:a", "-f", "null", "-"]);
  437 |       const sourceFrameTimes = await frameTimes(source);
  438 |       const outputFrameTimes = await frameTimes(output);
  439 |       const ssim = await compareFrames(source, output, false);
  440 |       const ordinalSsim = await compareFrames(source, output, true);
  441 |       rows.push({ container: adapter.container, kind: "independent-frame-diagnostic", status: "diagnostic-not-accepted",
  442 |         sourceProbe: before, outputProbe: after, sourceFrameTimes, outputFrameTimes,
  443 |         timestampAlignedSsim: ssim, ordinalSsim, nativeFullDecodePassed: true,
  444 |         audioPacketHashes: await audioHashes(output), sourceBytes: (await stat(source)).size,
  445 |         outputBytes: (await stat(output)).size,
  446 |         outputSha256: createHash("sha256").update(await readFile(output)).digest("hex"), metrics: state.metrics });
  447 |       const sourceAudioTimeline = await copiedAudioTimeline(source);
  448 |       const outputAudioTimeline = await copiedAudioTimeline(output);
  449 |       rows.push({ kind: "independent-copied-audio-timeline", sourceCodec: adapter.sourceCodec,
  450 |         sourceFormatStart: before.format.start_time, sourceFormatDuration: before.format.duration,
  451 |         outputFormatStart: after.format.start_time, outputFormatDuration: after.format.duration,
  452 |         sourceAudioTimeline, outputAudioTimeline });
  453 |       const sourceDecodedAudioHashes = await decodedAudioHashes(source);
  454 |       const outputDecodedAudioHashes = await decodedAudioHashes(output);
  455 |       rows.push({ kind: "independent-decoded-audio", sourceCodec: adapter.sourceCodec,
  456 |         sourceDecodedAudioHashes, outputDecodedAudioHashes });
  457 |       const copiedAudioTiming = validateCopiedAudioTiming(sourceAudioTimeline, outputAudioTimeline,
  458 |         before.streams.filter((s) => s.codec_type === "audio").map((s) => s.index), audio.map((s) => s.index));
  459 |       rows.push({ kind: "copied-audio-timing-passed", sourceCodec: adapter.sourceCodec, tracks: copiedAudioTiming });
  460 |       expect(outputDecodedAudioHashes, "Preserve complete decoded audible sample content and exact trim").toEqual(sourceDecodedAudioHashes);
  461 |       // Retain raw duration scalars above, but do not compare unlike origins:
  462 |       // Matroska Segment Duration versus MP4's fragment-derived stream span.
  463 |       // Require every actual track start/end within 1ms, exact decoded audio,
  464 |       // and BOTH headers independently consistent at the original 60ms.
  465 |       const presentationTimeline = validateSmallMatroskaMp4Timeline({
  466 |         sourceProbe: before, outputProbe: after, sourceFrames: sourceFrameTimes, outputFrames: outputFrameTimes,
  467 |         sourcePackets: sourceAudioTimeline, outputPackets: outputAudioTimeline,
  468 |         sourceDecodedAudioHashes, outputDecodedAudioHashes,
  469 |       });
  470 |       rows.push({ kind: "independent-presentation-timeline-passed", sourceCodec: adapter.sourceCodec,
  471 |         presentationTimeline });
  472 |       expect(outputFrameTimes).toHaveLength(sourceFrameTimes.length);
  473 |       for (let index = 0; index < sourceFrameTimes.length; index++) {
  474 |         expect(Number.isFinite(outputFrameTimes[index])).toBe(true);
  475 |         expect(Math.abs(outputFrameTimes[index] - sourceFrameTimes[index]), `frame ${index} presentation time`)
  476 |           .toBeLessThanOrEqual(0.001);
  477 |       }
  478 |       // Compare corresponding decoded frames, not framesync's prior frame at
  479 |       // a rounded container timestamp. The separate exact timeline gate above
  480 |       // prevents an ordinal quality comparison from hiding timing corruption.
  481 |       expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);
  482 |       // Match the full protected gate's compatible container-field contract.
  483 |       // Do not let a shorter metadata allowlist conceal original encoder or
  484 |       // creation-time loss before starting an expensive original-size job.
  485 |       for (const [key, value] of Object.entries(beforeTags)) {
  486 |         expect(afterTags[key], `Preserve compatible container metadata ${key}`).toBe(value);
  487 |       }
  488 |       rows.push({ container: adapter.container, status: "passed", sourceBytes: (await stat(source)).size,
  489 |         outputBytes: (await stat(output)).size, sourceCodec: beforeVideo.codec_name, destination: adapter.destination,
  490 |         outputCodec: afterVideo.codec_name, frames: afterVideo.nb_read_frames, audioTracks: audio.length,
  491 |         audioPacketHashes: await audioHashes(output), ssim: ordinalSsim, timestampAlignedSsim: ssim,
  492 |         sourceFrameTimes, outputFrameTimes, metrics: state.metrics,
  493 |         outputSha256: createHash("sha256").update(await readFile(output)).digest("hex"), warnings: state.warnings,
  494 |       });
  495 |     } catch (error) {
  496 |       rows.push({ container: adapter.container, status: "failed", error: String(error),
  497 |         state: await page.evaluate(() => window.__WITHIN_TEST__?.getState()).catch(() => null) });
  498 |       throw error;
  499 |     } finally {
  500 |       try {
  501 |         await page.evaluate(async () => {
  502 |           const directory = await navigator.storage.getDirectory();
  503 |           for await (const [name] of directory.entries()) await directory.removeEntry(name, { recursive: true });
  504 |           const remaining = [];
  505 |           for await (const [name] of directory.entries()) remaining.push(name);
  506 |           if (remaining.length) throw new Error("Candidate OPFS cleanup failed.");
  507 |         });
  508 |       } finally {
  509 |         try {
  510 |           const postBytes = (await stat(source)).size;
  511 |           expect(postBytes).toBeLessThan(16 * 1024 * 1024);
  512 |           const postSha256 = createHash("sha256").update(await readFile(source)).digest("hex");
  513 |           rows.push({ kind: "bitrate-input-after", bitRate: experimentBitRate, sourceBytes: postBytes, sourceSha256: postSha256 });
  514 |           expect(postBytes).toBe(sourceBytes); expect(postSha256).toBe(sourceSha256);
  515 |         } finally { await rm(output, { force: true }); }
  516 |       }
  517 |     }
  518 | }
  519 | 
  520 | async function recoverOnSamePage(page: import("@playwright/test").Page, originalWorker: import("@playwright/test").Worker, phase: string) {
> 521 |   expect(page.workers()).toHaveLength(1);
      |                          ^ Error: expect(received).toHaveLength(expected)
  522 |   expect(page.workers()[0]).toBe(originalWorker);
  523 |   rows.push({ kind: "adverse-native-configuration", phase, samples: [...bitrateAuditSamples], splitFinalSamples: [...splitFinalSamples] });
  524 |   bitrateAuditSamples.length = 0; splitFinalSamples.length = 0;
  525 |   // This updates only the existing localhost fault adapter. No navigation,
  526 |   // worker restart, parser, native context, or output bridge substitution.
  527 |   await page.evaluate(() => history.replaceState(null, "", "/?test=1&directory=1"));
  528 |   const startRow = rows.length;
  529 |   const adapter = adapters.find(a => a.fixture === "hevc" && a.destination === "direct")!;
  530 |   await validateConversion(page, adapter, false);
  531 |   expect(page.workers()).toHaveLength(1); expect(page.workers()[0]).toBe(originalWorker);
  532 |   rows.push({ kind: "actual-native-bitrate-configuration", bitRate: experimentBitRate, samples: [...bitrateAuditSamples] });
  533 |   const remaining = await page.evaluate(async () => {
  534 |     const directory = await navigator.storage.getDirectory(); const names: string[] = [];
  535 |     for await (const [name] of directory.entries()) names.push(name); return names;
  536 |   });
  537 |   expect(remaining).toEqual([]); rows.push({ cleanupRemovedEntries: remaining });
  538 |   rows.push({ kind: "validated-same-page-recovery", phase, startRow, endRow: rows.length, sameWorkerObject: true, noPageReload: true });
  539 | }
  540 | for (const adapter of adapters) {
  541 |   test(`private split MPEG2 ${adapter.sourceCodec} to ${adapter.container} via ${adapter.destination}: genuine encode preserves bounded PNG attached art plus audio and metadata`, async ({ page }) => {
  542 |     await validateConversion(page, adapter);
  543 |   });
  544 | }
  545 | 
  546 | test("private split MPEG2 propagates direct output write failure and removes partial output", async ({ page }) => {
  547 |   await page.goto("/?test=1&directory=1&fault=write");
  548 |   await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  549 |   expect(page.workers()).toHaveLength(1); const originalWorker = page.workers()[0];
  550 |   await page.locator('[data-testid="file-input"]').setInputFiles(path.join(work, "hevc.mkv"));
  551 |   await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  552 |   await page.locator('[data-testid="convert-button"]').click();
  553 |   await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error");
  554 |   const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
  555 |   expect(state.error?.toLowerCase()).toContain("destination rejected a bounded write");
  556 |   expect(state.metrics?.pendingOperations).toBe(0);
  557 |   expect(state.metrics?.queuedBytes).toBe(0);
  558 |   expect(state.opfsName).toBeNull();
  559 |   const files = await page.evaluate(async () => {
  560 |     const directory = await navigator.storage.getDirectory();
  561 |     const sizes: number[] = [];
  562 |     for await (const [, handle] of directory.entries()) {
  563 |       if (handle.kind === "file") sizes.push((await (handle as FileSystemFileHandle).getFile()).size);
  564 |     }
  565 |     return sizes;
  566 |   });
  567 |   expect(files.every((size) => size === 0)).toBe(true);
  568 |   rows.push({ kind: "direct-write-failure", status: "passed", error: state.error, metrics: state.metrics, partialBytes: files });
  569 |   await recoverOnSamePage(page, originalWorker, "write-failure");
  570 | });
  571 | 
  572 | test("private split MPEG2 cancels after genuine direct output and removes partial output", async ({ page }) => {
  573 |   try {
  574 |     await page.goto("/?test=1&directory=1");
  575 |     await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  576 |     expect(page.workers()).toHaveLength(1); const originalWorker = page.workers()[0];
  577 |     await page.locator('[data-testid="file-input"]').setInputFiles(path.join(work, "cancel.mkv"));
  578 |     await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  579 |     await page.locator('[data-testid="convert-button"]').click();
  580 |     await page.waitForFunction(() => {
  581 |       const state = window.__WITHIN_TEST__?.getState();
  582 |       return state?.jobState === "running" && (state.metrics?.outputBytes ?? 0) > 32768;
  583 |     });
  584 |     const beforeCancel = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
  585 |     await page.getByRole("button", { name: "Cancel safely", exact: true }).click();
  586 |     await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "cancelled");
  587 |     const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
  588 |     expect(beforeCancel.jobState).toBe("running");
  589 |     expect(beforeCancel.metrics?.outputBytes).toBeGreaterThan(32768);
  590 |     expect(state.metrics?.pendingOperations).toBe(0);
  591 |     expect(state.metrics?.queuedBytes).toBe(0);
  592 |     expect(state.opfsName).toBeNull();
  593 |     const partialBytes = await page.evaluate(async () => {
  594 |       const directory = await navigator.storage.getDirectory();
  595 |       const sizes: number[] = [];
  596 |       for await (const [, handle] of directory.entries()) {
  597 |         if (handle.kind === "file") sizes.push((await (handle as FileSystemFileHandle).getFile()).size);
  598 |       }
  599 |       return sizes;
  600 |     });
  601 |     expect(partialBytes.every((size) => size === 0)).toBe(true);
  602 |     rows.push({ kind: "cancel-after-direct-output", status: "passed", beforeCancel: beforeCancel.metrics,
  603 |       terminalState: state.jobState, metrics: state.metrics, partialBytes });
  604 |     await recoverOnSamePage(page, originalWorker, "cancellation");
  605 |   } catch (error) {
  606 |     rows.push({ kind: "cancel-after-direct-output", status: "failed", error: String(error),
  607 |       state: await page.evaluate(() => window.__WITHIN_TEST__?.getState()).catch(() => null) });
  608 |     throw error;
  609 |   }
  610 | });
  611 | 
```