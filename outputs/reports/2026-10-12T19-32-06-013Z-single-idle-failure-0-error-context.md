# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: candidate.spec.ts >> private production input scans whole original without converting
- Location: work\packet-cache-media-qFsXb5\candidate.spec.ts:311:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 1
Received:   1
```

# Test source

```ts
  157 | 
  158 | test.beforeAll(async () => {
  159 |   await mkdir(path.join(root, "work"), { recursive: true });
  160 |   work = await mkdtemp(path.join(root, "work/mpeg2-artwork-validation-"));
  161 | });
  162 | 
  163 | test.beforeEach(async ({ context, browser, page }) => {
  164 |   forbiddenRequests.length = 0;
  165 |   stackReserveSamples.length = 0;
  166 |   splitFinalSamples.length = 0;
  167 |   asyncifyStorageSamples.length = 0;
  168 |   inputReadFailureSamples.length = 0;
  169 |   inputScanResults.length = 0;
  170 |   bitrateAuditSamples.length = 0;
  171 |   page.on("console", (message) => {
  172 |     const text = message.text(), prefix = "WITHIN_MPEG2_STACK_RESERVE ";
  173 |     if (text.startsWith(prefix) && text.length <= 512 && stackReserveSamples.length < 16)
  174 |       stackReserveSamples.push(JSON.parse(text.slice(prefix.length)));
  175 |     const bitratePrefix = "WITHIN_MPEG2_BITRATE_AUDIT ";
  176 |     if (text.startsWith(bitratePrefix) && text.length <= 2048 && bitrateAuditSamples.length < 2)
  177 |       bitrateAuditSamples.push(JSON.parse(text.slice(bitratePrefix.length)));
  178 |     const scanPrefix = "WITHIN_INPUT_SCAN_RESULT ";
  179 |     if (text.startsWith(scanPrefix) && text.length <= 2048 && inputScanResults.length < 1)
  180 |       inputScanResults.push(JSON.parse(text.slice(scanPrefix.length)));
  181 |     const inputPrefix = "WITHIN_INPUT_READ_FAILURE ";
  182 |     if (text.startsWith(inputPrefix) && text.length <= 2048 && inputReadFailureSamples.length < 4)
  183 |       inputReadFailureSamples.push(JSON.parse(text.slice(inputPrefix.length)));
  184 |     const storagePrefix = "WITHIN_ASYNCIFY_STORAGE_FINAL ";
  185 |     if (text.startsWith(storagePrefix) && text.length <= 2048 && asyncifyStorageSamples.length < 8)
  186 |       asyncifyStorageSamples.push(JSON.parse(text.slice(storagePrefix.length)));
  187 |     const splitPrefix = "WITHIN_MPEG2_SPLIT_FINAL ";
  188 |     if (text.startsWith(splitPrefix) && text.length <= 2048 && splitFinalSamples.length < 16)
  189 |       splitFinalSamples.push(JSON.parse(text.slice(splitPrefix.length)));
  190 |   });
  191 |   const origin = new URL(process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${process.env.WITHIN_TEST_PORT ?? "3000"}`).origin;
  192 |   context.on("request", (request) => {
  193 |     if (new URL(request.url()).origin !== origin || !["GET", "HEAD"].includes(request.method()) || request.postData()) {
  194 |       if (forbiddenRequests.length < 32) forbiddenRequests.push(`${request.method()} ${request.url()}`);
  195 |     }
  196 |   });
  197 |   memorySamples.length = 0;
  198 |   const session = await browser.newBrowserCDPSession();
  199 |   const info = await session.send("SystemInfo.getProcessInfo");
  200 |   await session.detach();
  201 |   const rootPid = info.processInfo.find((entry) => entry.type === "browser")?.id;
  202 |   if (!rootPid) throw new Error("The whole Chromium tree root could not be identified.");
  203 |   memorySamples.push(await sampleTree(rootPid, "blank-diagnostic-not-certified-stable-baseline"));
  204 |   sampling = true;
  205 |   memoryTask = (async () => {
  206 |     const pendingHeaps = new WeakSet<object>();
  207 |     const boundedHeap = async (realm: object, operation: () => Promise<number | null>) => {
  208 |       if (pendingHeaps.has(realm)) return null;
  209 |       pendingHeaps.add(realm);
  210 |       const promise = operation().catch(() => null).finally(() => pendingHeaps.delete(realm));
  211 |       let timer: ReturnType<typeof setTimeout> | undefined;
  212 |       try {
  213 |         return await Promise.race([promise, new Promise<null>((resolve) => {
  214 |           timer = setTimeout(() => resolve(null), 1000);
  215 |         })]);
  216 |       } finally { clearTimeout(timer); }
  217 |     };
  218 |     while (sampling) {
  219 |       const phase = await page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState ?? "loading").catch(() => "unavailable");
  220 |       const sample = await sampleTree(rootPid, phase);
  221 |       const diagnosticHeap = () => {
  222 |         const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  223 |         return memory?.usedJSHeapSize ?? null;
  224 |       };
  225 |       sample.realms = {
  226 |         pageUsedJSHeapBytes: await boundedHeap(page, () => page.evaluate(diagnosticHeap)),
  227 |         workers: await Promise.all(page.workers().map(async (worker) => ({
  228 |           url: worker.url(), usedJSHeapBytes: await boundedHeap(worker, () => worker.evaluate(diagnosticHeap)),
  229 |         }))),
  230 |       };
  231 |       if (memorySamples.length === 256) memorySamples.shift();
  232 |       memorySamples.push(sample);
  233 |       if (sampling) await new Promise((resolve) => setTimeout(resolve, 250));
  234 |     }
  235 |   })();
  236 |   // Explicit staged-module adapter in disposable dist assets. Production
  237 |   // worker, original File, AVIO, cancellation and writers remain unchanged.
  238 |   // Worker imports cannot be reliably substituted with context.route here.
  239 |   const staged = await readFile(path.join(root, "dist/client/engines/remux/within-remux.mjs"), "utf8");
  240 |   expect(staged).toContain("PRIVATE_MPEG2_SPLIT_PRODUCTION_ADAPTER_NOT_PUBLIC_SUPPORT");
  241 | });
  242 | 
  243 | test.afterEach(async ({ page }) => {
  244 |   sampling = false;
  245 |   await memoryTask;
  246 |   memoryTask = null;
  247 |   expect(forbiddenRequests, "conversion must not transmit data or contact external origins").toEqual([]);
  248 |   rows.push({ memoryScope: "Whole-process diagnostic samples; short fixtures and non-stabilized baseline do not certify the 250 MiB contract", samples: [...memorySamples] });
  249 |   rows.push({ kind: "actual-native-stack-reserve", samples: [...stackReserveSamples],
  250 |     scope: "Reserved capacity, not measured high-water or memory acceptance" });
  251 |   rows.push({ kind: "actual-split-native-ownership", samples: [...splitFinalSamples],
  252 |     scope: "Codec ownership/transport, not complete-process memory acceptance" });
  253 |   rows.push({ kind: "input-read-diagnostics", samples: [...inputReadFailureSamples] });
  254 |   rows.push({ kind: "actual-asyncify-storage-lifecycle", samples: [...asyncifyStorageSamples] });
  255 |   expect(asyncifyStorageSamples.length).toBeGreaterThan(0);
  256 |   for (const sample of asyncifyStorageSamples) {
> 257 |     expect(sample.allocations).toBe(1); expect(sample.frees).toBe(1); expect(sample.acquisitions).toBeGreaterThan(1);
      |                                                                                                   ^ Error: expect(received).toBeGreaterThan(expected)
  258 |     expect(sample.activeLeases).toBe(0); expect(sample.retainedBytes).toBe(0); expect(sample.maximumLeases).toBe(1);
  259 |     expect(sample.stackBytes).toBe(262144); expect(sample.reservationBytes).toBe(262156);
  260 |     expect(sample.closing).toBe(true); expect(sample.abortedReleaseDeferredUntilWorkerTermination).toBe(false);
  261 |   }
  262 |   expect(splitFinalSamples.length).toBeGreaterThan(0);
  263 |   rows.push({ kind: "actual-native-bitrate-configuration", bitRate: experimentBitRate, samples: [...bitrateAuditSamples] });
  264 |   for (const sample of splitFinalSamples) {
  265 |     expect(sample.aggregateWasmMemoryBytes).toBe(50331648); expect(sample.activePackets).toBe(0);
  266 |     expect(sample.queuedFrames).toBe(0); expect(sample.queuedPackets).toBe(0);
  267 |     expect(sample.additionalPixelBufferBytes).toBe(0); expect(sample.additionalJsPacketBufferBytes).toBe(0);
  268 |     expect(sample.closed).toBe(true);
  269 |     expect(sample.maximumMediaAvioWriteBytes).toBeLessThanOrEqual(256 * 1024);
  270 |   }
  271 |   if (expectedManifest?.nativeStackBytesPerCore !== undefined) {
  272 |     expect(stackReserveSamples.length).toBeGreaterThan(0);
  273 |     for (const sample of stackReserveSamples) {
  274 |       expect(sample.nativeStackBytes).toBe(262144); expect(sample.asyncifyStackBytes).toBe(262144);
  275 |       expect(sample.stackOverflowCheck).toBe(2);
  276 |       expect(sample.encoderNativeStackBytes).toBe(262144);
  277 |       expect(sample.decoderMemoryBytes).toBe(33554432); expect(sample.encoderMemoryBytes).toBe(16777216);
  278 |       expect(sample.aggregateWasmMemoryBytes).toBe(50331648);
  279 |       expect(sample.scope).toBe("reserved-not-high-water-not-acceptance");
  280 |     }
  281 |   }
  282 |   if (page.isClosed()) return;
  283 |   const entries = await page.evaluate(async () => {
  284 |     const directory = await navigator.storage.getDirectory();
  285 |     const names: string[] = [];
  286 |     for await (const [name] of directory.entries()) names.push(name);
  287 |     for (const name of names) await directory.removeEntry(name, { recursive: true });
  288 |     return names;
  289 |   });
  290 |   rows.push({ cleanupRemovedEntries: entries });
  291 | });
  292 | 
  293 | test.afterAll(async () => {
  294 |   try {
  295 |     await mkdir(path.dirname(report), { recursive: true });
  296 |     if (rows.length > 1024) throw new Error("Diagnostic history cap reached: retain compact evidence before another run.");
  297 |     await writeFile(report, `${JSON.stringify({
  298 |       recordedAt: new Date().toISOString(),
  299 |       scope: "Private MPEG2 kernel substituted through production browser worker/I/O; NOT public-profile, stress or complete-process memory certification",
  300 |       manifest: JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8")),
  301 |       candidateName, rows,
  302 |     }, null, 2)}\n`, { flag: "wx" });
  303 |   } finally {
  304 |     if (work) {
  305 |       expect(path.dirname(work)).toBe(path.join(root, "work"));
  306 |       await rm(work, { recursive: true, force: true });
  307 |     }
  308 |   }
  309 | });
  310 | 
  311 | test("private production input scans whole original without converting", async ({ page }) => {
  312 |   test.setTimeout(600000);
  313 |   const source = path.join(root, "test.mkv"); expect((await stat(source)).size).toBe(2958573265);
  314 |   await page.goto("/?test=1&directory=1");
  315 |   await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  316 |   expect(page.workers()).toHaveLength(1); const originalWorker = page.workers()[0];
  317 |   await originalWorker.evaluate(() => { (globalThis as typeof globalThis & { __WITHIN_INPUT_SCAN_CONTROL__?: boolean }).__WITHIN_INPUT_SCAN_CONTROL__ = true; });
  318 |   await page.locator('[data-testid="file-input"]').setInputFiles(source);
  319 |   await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  320 |   await page.locator('[data-testid="convert-button"]').click();
  321 |   await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error", undefined, { timeout: 570000 });
  322 |   const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
  323 |   expect(state.error).toContain("Input-only scan completed; no conversion");
  324 |   expect(inputScanResults).toHaveLength(1); expect(inputReadFailureSamples).toEqual([]);
  325 |   expect(inputScanResults[0].sequentialBytes).toBe(2958573265); expect(inputScanResults[0].bufferBytes).toBe(65536);
  326 |   expect(inputScanResults[0].maximumPendingReads).toBe(1);
  327 |   expect(state.metrics?.outputBytes).toBe(0); expect(state.metrics?.pendingOperations).toBe(0); expect(state.metrics?.queuedBytes).toBe(0);
  328 |   const remaining = await page.evaluate(async () => {
  329 |     const directory = await navigator.storage.getDirectory(); const sizes: number[] = [];
  330 |     for await (const [, handle] of directory.entries()) if (handle.kind === "file") sizes.push((await (handle as FileSystemFileHandle).getFile()).size);
  331 |     return sizes;
  332 |   });
  333 |   expect(remaining.every(bytes => bytes === 0)).toBe(true);
  334 |   await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  335 |   expect(page.workers()).not.toContain(originalWorker);
  336 |   rows.push({ kind: "whole-original-production-input-scan", result: inputScanResults[0], terminalState: state.jobState,
  337 |     metrics: state.metrics, partialBytes: remaining, productionWorkerRetired: true, notConversion: true });
  338 | });
  339 | 
```