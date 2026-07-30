/// <reference lib="webworker" />

import type {
  ConversionMetrics,
  WorkerRequest,
  WorkerResponse,
} from "../lib/conversion-protocol";
import { runMediaRemux } from "./media-remux";
import {
  syncOpfsDestination,
  type RandomAccessDestination,
} from "./random-access-destination";

const workerScope: DedicatedWorkerGlobalScope = self as never;
const MAX_WRITE_CHUNK = 256 * 1024;
const MAX_TEXT_RECORD = 1024 * 1024;
const MAX_GZIP_EXPANSION_RATIO = 100;
const MAX_GZIP_OUTPUT = 64 * 1024 * 1024 * 1024;

let activeJobId: string | null = null;
let cancelled = false;
let lastProgressAt = 0;

function post(message: WorkerResponse): void {
  workerScope.postMessage(message);
}

function newMetrics(): ConversionMetrics {
  return {
    inputBytes: 0,
    outputBytes: 0,
    queuedBytes: 0,
    peakQueuedBytes: 0,
    pendingOperations: 0,
    peakPendingOperations: 0,
    maxReadChunkBytes: 0,
    maxWriteChunkBytes: 0,
    elapsedMs: 0,
    wasmMemoryBytes: 0,
    peakWasmMemoryBytes: 0,
    sharedArrayBufferBytes: 0,
    activeWorkerCount: 1,
  };
}

function assertActive(): void {
  if (cancelled) {
    throw new DOMException("Conversion cancelled", "AbortError");
  }
}

interface Destination {
  writable: RandomAccessDestination;
  opfsName?: string;
}

async function openDestination(
  destination:
    | { mode: "handle"; handle: FileSystemFileHandle }
    | { mode: "opfs-test"; name: string },
  preferSynchronousOpfs = false,
): Promise<Destination> {
  if (destination.mode === "handle") {
    const writable = await destination.handle.createWritable({
      keepExistingData: false,
    });
    await writable.truncate(0);
    const direct = writable as unknown as RandomAccessDestination;
    direct.requiresOwnedWriteBuffer = true;
    return { writable: direct };
  }

  const root = await withTimeout(
    navigator.storage.getDirectory(),
    10_000,
    "Private browser storage did not open within 10 seconds.",
  );
  const handle = await root.getFileHandle(destination.name, { create: true });
  if (preferSynchronousOpfs && handle.createSyncAccessHandle) {
    const access = await handle.createSyncAccessHandle();
    access.truncate(0);
    return {
      writable: syncOpfsDestination(
        access,
        handle,
        root,
        destination.name,
      ),
      opfsName: destination.name,
    };
  }
  const writable = await handle.createWritable({ keepExistingData: false });
  await writable.truncate(0);
  const asynchronous = writable as unknown as RandomAccessDestination;
  asynchronous.requiresOwnedWriteBuffer = true;
  return {
    writable: asynchronous,
    opfsName: destination.name,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = self.setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    self.clearTimeout(timer);
  }
}

function updateElapsed(metrics: ConversionMetrics, startedAt: number): void {
  metrics.elapsedMs = performance.now() - startedAt;
}

function emitProgress(
  jobId: string,
  phase: string,
  metrics: ConversionMetrics,
  startedAt: number,
  force = false,
): void {
  const now = performance.now();
  if (!force && now - lastProgressAt < 125) return;
  lastProgressAt = now;
  updateElapsed(metrics, startedAt);
  post({ type: "progress", jobId, phase, metrics: { ...metrics } });
}

async function writeBounded(
  destination: RandomAccessDestination,
  chunk: Uint8Array,
  jobId: string,
  phase: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  for (let offset = 0; offset < chunk.byteLength; offset += MAX_WRITE_CHUNK) {
    assertActive();
    const part = chunk.subarray(
      offset,
      Math.min(offset + MAX_WRITE_CHUNK, chunk.byteLength),
    );
    metrics.queuedBytes = part.byteLength;
    metrics.peakQueuedBytes = Math.max(
      metrics.peakQueuedBytes,
      metrics.queuedBytes,
    );
    metrics.pendingOperations = 1;
    metrics.peakPendingOperations = Math.max(
      metrics.peakPendingOperations,
      metrics.pendingOperations,
    );
    metrics.maxWriteChunkBytes = Math.max(
      metrics.maxWriteChunkBytes,
      part.byteLength,
    );
    const writeChunk = new Uint8Array(part.byteLength);
    writeChunk.set(part);
    await destination.write(writeChunk);
    metrics.outputBytes += part.byteLength;
    metrics.queuedBytes = 0;
    metrics.pendingOperations = 0;
    emitProgress(jobId, phase, metrics, startedAt);
  }
}

async function runCompression(
  file: File,
  destination: RandomAccessDestination,
  decompress: boolean,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      assertActive();
      metrics.inputBytes += chunk.byteLength;
      metrics.maxReadChunkBytes = Math.max(
        metrics.maxReadChunkBytes,
        chunk.byteLength,
      );
      controller.enqueue(chunk);
    },
  });
  const codec = decompress
    ? new DecompressionStream("gzip")
    : new CompressionStream("gzip");
  const reader = file
    .stream()
    .pipeThrough(counter)
    .pipeThrough(
      codec as unknown as ReadableWritablePair<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >,
    )
    .getReader();

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    if (decompress) {
      const projected = metrics.outputBytes + value.byteLength;
      const ratio = projected / Math.max(1, metrics.inputBytes);
      if (
        projected > MAX_GZIP_OUTPUT ||
        (metrics.inputBytes > 1024 * 1024 && ratio > MAX_GZIP_EXPANSION_RATIO)
      ) {
        await reader.cancel("GZIP expansion safety limit exceeded");
        throw new Error(
          `Decompression stopped: output exceeded the ${MAX_GZIP_EXPANSION_RATIO}:1 expansion safety limit.`,
        );
      }
    }
    await writeBounded(
      destination,
      value,
      jobId,
      decompress ? "Decompressing" : "Compressing",
      metrics,
      startedAt,
    );
  }
}

async function* readLines(
  file: File,
  metrics: ConversionMetrics,
): AsyncGenerator<string> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
  let firstChunk = true;

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    metrics.inputBytes += value.byteLength;
    metrics.maxReadChunkBytes = Math.max(
      metrics.maxReadChunkBytes,
      value.byteLength,
    );
    let decoded = decoder.decode(value, { stream: true });
    if (firstChunk) {
      decoded = decoded.replace(/^\uFEFF/, "");
      firstChunk = false;
    }
    carry += decoded;
    if (carry.length > MAX_TEXT_RECORD * 2) {
      throw new Error("A text line exceeds the 1 MiB safety limit.");
    }
    let newline = carry.indexOf("\n");
    while (newline >= 0) {
      const line = carry.slice(0, newline).replace(/\r$/, "");
      carry = carry.slice(newline + 1);
      yield line;
      newline = carry.indexOf("\n");
    }
  }

  carry += decoder.decode();
  if (carry.length) yield carry.replace(/\r$/, "");
}

async function runSubtitles(
  file: File,
  destination: RandomAccessDestination,
  toVtt: boolean,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const encoder = new TextEncoder();
  let block: string[] = [];
  let cueNumber = 0;
  let inVttHeader = !toVtt;

  if (toVtt) {
    await writeBounded(
      destination,
      encoder.encode("WEBVTT\r\n\r\n"),
      jobId,
      "Converting cues",
      metrics,
      startedAt,
    );
  }

  const flushBlock = async (): Promise<void> => {
    if (!block.length) return;
    const chars = block.reduce((sum, line) => sum + line.length, 0);
    if (chars > MAX_TEXT_RECORD) {
      throw new Error("A subtitle cue exceeds the 1 MiB safety limit.");
    }

    let output: string;
    if (toVtt) {
      const lines = [...block];
      if (/^\d+$/.test(lines[0] ?? "")) lines.shift();
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        throw new Error("Invalid SRT cue: timing line is missing.");
      }
      lines[timingIndex] = lines[timingIndex].replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
        "$1.$2",
      );
      output = `${lines.join("\r\n")}\r\n\r\n`;
    } else {
      const lines = [...block];
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        block = [];
        return;
      }
      const timing = lines[timingIndex]
        .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2")
        .replace(
          /^(\S+\s+-->\s+\S+).*$/,
          "$1",
        );
      const payload = lines.slice(timingIndex + 1);
      cueNumber += 1;
      output = `${cueNumber}\r\n${timing}\r\n${payload.join("\r\n")}\r\n\r\n`;
    }
    block = [];
    await writeBounded(
      destination,
      encoder.encode(output),
      jobId,
      "Converting cues",
      metrics,
      startedAt,
    );
  };

  for await (const line of readLines(file, metrics)) {
    assertActive();
    if (inVttHeader) {
      if (line.trim() === "") inVttHeader = false;
      continue;
    }
    if (line.trim() === "") {
      await flushBlock();
    } else {
      block.push(line);
    }
  }
  await flushBlock();
}

async function* readDelimitedRecords(
  file: File,
  delimiter: string,
  metrics: ConversionMetrics,
): AsyncGenerator<string[]> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let skipLf = false;
  let firstChunk = true;

  const recordSize = (): number =>
    field.length + fields.reduce((sum, value) => sum + value.length, 0);

  const consume = function* (text: string): Generator<string[]> {
    for (const char of text) {
      if (skipLf) {
        skipLf = false;
        if (char === "\n") continue;
      }
      if (inQuotes) {
        if (afterQuote) {
          if (char === '"') {
            field += '"';
            afterQuote = false;
            continue;
          }
          inQuotes = false;
          afterQuote = false;
        } else if (char === '"') {
          afterQuote = true;
          continue;
        } else {
          field += char;
          if (recordSize() > MAX_TEXT_RECORD) {
            throw new Error("A delimited record exceeds the 1 MiB safety limit.");
          }
          continue;
        }
      }

      if (char === '"' && field.length === 0) {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        fields.push(field);
        field = "";
        const record = fields;
        fields = [];
        if (char === "\r") skipLf = true;
        yield record;
      } else {
        field += char;
      }
      if (recordSize() > MAX_TEXT_RECORD) {
        throw new Error("A delimited record exceeds the 1 MiB safety limit.");
      }
    }
  };

  for (;;) {
    assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    metrics.inputBytes += value.byteLength;
    metrics.maxReadChunkBytes = Math.max(
      metrics.maxReadChunkBytes,
      value.byteLength,
    );
    let decoded = decoder.decode(value, { stream: true });
    if (firstChunk) {
      decoded = decoded.replace(/^\uFEFF/, "");
      firstChunk = false;
    }
    yield* consume(decoded);
  }
  yield* consume(decoder.decode());
  if (inQuotes && !afterQuote) {
    throw new Error("Invalid delimited file: an quoted field is not closed.");
  }
  if (field.length || fields.length) {
    fields.push(field);
    yield fields;
  }
}

function serializeDelimited(values: readonly unknown[], delimiter: string): string {
  return `${values
    .map((value) => {
      const text = value == null ? "" : String(value);
      return text.includes(delimiter) || /["\r\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
    })
    .join(delimiter)}\r\n`;
}

function normalizedHeaders(values: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

async function runDelimitedInput(
  file: File,
  sourceDelimiter: string,
  output: "csv" | "tsv" | "ndjson",
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const encoder = new TextEncoder();
  let headers: string[] | null = null;
  for await (const record of readDelimitedRecords(
    file,
    sourceDelimiter,
    metrics,
  )) {
    assertActive();
    let text: string;
    if (output === "ndjson") {
      if (!headers) {
        headers = normalizedHeaders(record);
        continue;
      }
      const object = Object.fromEntries(
        headers.map((header, index) => [header, record[index] ?? ""]),
      );
      text = `${JSON.stringify(object)}\n`;
    } else {
      text = serializeDelimited(record, output === "csv" ? "," : "\t");
    }
    await writeBounded(
      destination,
      encoder.encode(text),
      jobId,
      "Converting records",
      metrics,
      startedAt,
    );
  }
}

async function runNdjsonInput(
  file: File,
  outputDelimiter: string,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const encoder = new TextEncoder();
  let headers: string[] | null = null;
  let warnedExtraKeys = false;

  for await (const line of readLines(file, metrics)) {
    assertActive();
    if (!line.trim()) continue;
    const parsed: unknown = JSON.parse(line);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Each NDJSON line must contain one JSON object.");
    }
    const object = parsed as Record<string, unknown>;
    if (!headers) {
      headers = Object.keys(object);
      if (!headers.length) {
        throw new Error("The first NDJSON object has no fields.");
      }
      await writeBounded(
        destination,
        encoder.encode(serializeDelimited(headers, outputDelimiter)),
        jobId,
        "Converting records",
        metrics,
        startedAt,
      );
    } else if (
      !warnedExtraKeys &&
      Object.keys(object).some((key) => !headers!.includes(key))
    ) {
      warnedExtraKeys = true;
      post({
        type: "warning",
        jobId,
        message:
          "Later NDJSON objects contain extra keys. They were ignored because output columns are fixed by the first object.",
      });
    }
    const row = headers.map((header) => {
      const value = object[header];
      return value != null && typeof value === "object"
        ? JSON.stringify(value)
        : value;
    });
    await writeBounded(
      destination,
      encoder.encode(serializeDelimited(row, outputDelimiter)),
      jobId,
      "Converting records",
      metrics,
      startedAt,
    );
  }
}

async function runRecords(
  profileId: string,
  file: File,
  destination: RandomAccessDestination,
  jobId: string,
  metrics: ConversionMetrics,
  startedAt: number,
): Promise<void> {
  const [input, output] = profileId.replace("-to-", ":").split(":");
  if (input === "ndjson") {
    await runNdjsonInput(
      file,
      output === "csv" ? "," : "\t",
      destination,
      jobId,
      metrics,
      startedAt,
    );
    return;
  }
  await runDelimitedInput(
    file,
    input === "csv" ? "," : "\t",
    output as "csv" | "tsv" | "ndjson",
    destination,
    jobId,
    metrics,
    startedAt,
  );
}

async function runJob(message: Extract<WorkerRequest, { type: "start" }>) {
  const { jobId, profileId, file } = message;
  activeJobId = jobId;
  cancelled = false;
  lastProgressAt = 0;
  const metrics = newMetrics();
  const startedAt = performance.now();
  let destination: Destination | null = null;

  try {
    emitProgress(jobId, "Worker started", metrics, startedAt, true);
    destination = await openDestination(
      message.destination,
      (profileId === "mkv-to-mp4" ||
        profileId === "mkv-to-m4a" ||
        profileId === "mkv-to-wav" ||
        profileId === "mkv-to-mp4-mpeg4") &&
        message.destination.mode === "opfs-test",
    );
    emitProgress(jobId, "Destination opened", metrics, startedAt, true);
    if (profileId === "gzip-compress" || profileId === "gzip-decompress") {
      await runCompression(
        file,
        destination.writable,
        profileId === "gzip-decompress",
        jobId,
        metrics,
        startedAt,
      );
    } else if (profileId === "srt-to-vtt" || profileId === "vtt-to-srt") {
      await runSubtitles(
        file,
        destination.writable,
        profileId === "srt-to-vtt",
        jobId,
        metrics,
        startedAt,
      );
    } else if (
      profileId === "mkv-to-mp4" ||
      profileId === "mkv-to-m4a" ||
      profileId === "mkv-to-wav" ||
      profileId === "mkv-to-mp4-mpeg4"
    ) {
      await runMediaRemux({
        file,
        writable: destination.writable,
        remuxProfile:
          profileId === "mkv-to-wav"
            ? 3
            : profileId === "mkv-to-mp4-mpeg4"
              ? 4
            : profileId === "mkv-to-m4a"
              ? 2
              : 1,
        jobId,
        metrics,
        startedAt,
        isCancelled: () => cancelled,
        emitProgress,
        post,
      });
    } else if (profileId.includes("-to-")) {
      await runRecords(
        profileId,
        file,
        destination.writable,
        jobId,
        metrics,
        startedAt,
      );
    } else {
      throw new Error("This conversion engine is not installed.");
    }

    assertActive();
    await destination.writable.close();
    updateElapsed(metrics, startedAt);
    emitProgress(jobId, "Complete", metrics, startedAt, true);
    post({
      type: "complete",
      jobId,
      metrics: { ...metrics },
      opfsName: destination.opfsName,
    });
  } catch (error) {
    updateElapsed(metrics, startedAt);
    try {
      await destination?.writable.abort(error);
    } catch {
      // The destination may already be closed or unavailable.
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      post({ type: "cancelled", jobId, metrics: { ...metrics } });
    } else {
      post({
        type: "error",
        jobId,
        message: error instanceof Error ? error.message : String(error),
        metrics: { ...metrics },
      });
    }
  } finally {
    activeJobId = null;
    cancelled = false;
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (activeJobId === message.jobId) cancelled = true;
    return;
  }
  if (activeJobId) {
    post({
      type: "error",
      jobId: message.jobId,
      message: "The worker is already processing another conversion.",
      metrics: newMetrics(),
    });
    return;
  }
  void runJob(message);
};

post({ type: "ready" });
