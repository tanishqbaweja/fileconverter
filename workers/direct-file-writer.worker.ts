/// <reference lib="webworker" />

import {
  DIRECT_ABORT,
  DIRECT_CLOSE,
  DIRECT_COMMAND,
  DIRECT_DONE,
  DIRECT_ERROR_LENGTH,
  DIRECT_FAILED,
  DIRECT_LENGTH,
  DIRECT_OFFSET_HIGH,
  DIRECT_OFFSET_LOW,
  DIRECT_OPERATION,
  DIRECT_STATE,
  DIRECT_TRUNCATE,
  DIRECT_WRITE,
  type DirectWriterRequest,
  type DirectWriterResponse,
} from "./direct-writer-protocol";

const writerScope: DedicatedWorkerGlobalScope = self as never;
const encoder = new TextEncoder();
let streamWriter: WritableStreamDefaultWriter<FileSystemWriteChunkType> | null =
  null;
let control: Int32Array | null = null;
let payload: Uint8Array | null = null;
let errorBytes: Uint8Array | null = null;
let ownedPayload: Uint8Array<ArrayBuffer> | null = null;
let position = 0;
let busy = false;

function post(message: DirectWriterResponse): void {
  writerScope.postMessage(message);
}

function errorText(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function signal(state: typeof DIRECT_DONE | typeof DIRECT_FAILED, error?: unknown) {
  if (!control || !errorBytes) return;
  if (error !== undefined) {
    const encoded = encoder.encode(errorText(error));
    const length = Math.min(encoded.byteLength, errorBytes.byteLength);
    errorBytes.fill(0);
    errorBytes.set(encoded.subarray(0, length));
    Atomics.store(control, DIRECT_ERROR_LENGTH, length);
  }
  Atomics.store(control, DIRECT_STATE, state);
  Atomics.notify(control, DIRECT_STATE, 1);
}

async function runCommand(): Promise<void> {
  if (busy || !streamWriter || !control || !payload || !ownedPayload) return;
  if (Atomics.load(control, DIRECT_STATE) !== DIRECT_COMMAND) return;
  busy = true;
  try {
    const operation = Atomics.load(control, DIRECT_OPERATION);
    const low = Atomics.load(control, DIRECT_OFFSET_LOW) >>> 0;
    const high = Atomics.load(control, DIRECT_OFFSET_HIGH) >>> 0;
    const offset = high * 0x1_0000_0000 + low;
    const length = Atomics.load(control, DIRECT_LENGTH);

    if (operation === DIRECT_WRITE) {
      if (length < 0 || length > payload.byteLength) {
        throw new RangeError(`Invalid direct-write length: ${length}.`);
      }
      ownedPayload.set(payload.subarray(0, length), 0);
      const chunk = ownedPayload.subarray(0, length);
      if (offset === position) {
        await streamWriter.write(chunk);
      } else {
        await streamWriter.write({
          type: "write",
          position: offset,
          data: chunk,
        });
      }
      position = offset + length;
    } else if (operation === DIRECT_TRUNCATE) {
      await streamWriter.write({ type: "truncate", size: offset });
      if (position > offset) position = offset;
    } else if (operation === DIRECT_CLOSE) {
      await streamWriter.close();
      streamWriter = null;
    } else if (operation === DIRECT_ABORT) {
      await streamWriter.abort();
      streamWriter = null;
    } else {
      throw new Error(`Unknown direct-writer operation: ${operation}.`);
    }
    signal(DIRECT_DONE);
  } catch (error) {
    signal(DIRECT_FAILED, error);
  } finally {
    busy = false;
  }
}

writerScope.onmessage = (event: MessageEvent<DirectWriterRequest>) => {
  const message = event.data;
  if (message.type === "command") {
    void runCommand();
    return;
  }
  void (async () => {
    try {
      control = new Int32Array(message.controlBuffer);
      payload = new Uint8Array(message.payloadBuffer);
      errorBytes = new Uint8Array(message.errorBuffer);
      ownedPayload = new Uint8Array(payload.byteLength);
      const writable = await message.handle.createWritable({
        keepExistingData: false,
      });
      await writable.truncate(0);
      streamWriter = writable.getWriter();
      post({ type: "ready" });
    } catch (error) {
      post({ type: "init-error", message: errorText(error) });
    }
  })();
};
