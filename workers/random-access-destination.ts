export type DestinationWrite =
  | Uint8Array<ArrayBuffer>
  | {
      type: "write";
      position?: number;
      data: Uint8Array<ArrayBuffer>;
    };

export interface RandomAccessDestination {
  requiresOwnedWriteBuffer: boolean;
  additionalWorkerCount?: number;
  sharedBufferBytes?: number;
  write(data: DestinationWrite): Promise<void>;
  writeSync?(data: DestinationWrite): boolean;
  rotate?(): Promise<void>;
  truncate(size: number): Promise<void>;
  truncateSync?(size: number): void;
  flush?(): Promise<void>;
  flushSync?(): void;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

const SYNC_FLUSH_INTERVAL_BYTES = 8 * 1024 * 1024;
const SYNC_REOPEN_INTERVAL_BYTES = 128 * 1024 * 1024;

import {
  DIRECT_ABORT,
  DIRECT_CLOSE,
  DIRECT_COMMAND,
  DIRECT_DONE,
  DIRECT_WRITER_ERROR_BYTES,
  DIRECT_ERROR_LENGTH,
  DIRECT_FAILED,
  DIRECT_IDLE,
  DIRECT_LENGTH,
  DIRECT_OFFSET_HIGH,
  DIRECT_OFFSET_LOW,
  DIRECT_OPERATION,
  DIRECT_STATE,
  DIRECT_TRUNCATE,
  DIRECT_WRITE,
  DIRECT_WRITER_CONTROL_WORDS,
  DIRECT_WRITER_PAYLOAD_BYTES,
  type DirectWriterResponse,
} from "./direct-writer-protocol";

const DIRECT_COMMAND_TIMEOUT_MS = 120_000;

export async function sharedDirectFileDestination(
  handle: FileSystemFileHandle,
): Promise<RandomAccessDestination> {
  const controlBuffer = new SharedArrayBuffer(
    DIRECT_WRITER_CONTROL_WORDS * Int32Array.BYTES_PER_ELEMENT,
  );
  const payloadBuffer = new SharedArrayBuffer(DIRECT_WRITER_PAYLOAD_BYTES);
  const errorBuffer = new SharedArrayBuffer(DIRECT_WRITER_ERROR_BYTES);
  const control = new Int32Array(controlBuffer);
  const payload = new Uint8Array(payloadBuffer);
  const errorBytes = new Uint8Array(errorBuffer);
  const decoder = new TextDecoder();
  const worker = new Worker(
    new URL("./direct-file-writer.worker.ts", import.meta.url),
    { type: "module", name: "within-direct-writer" },
  );
  let position = 0;
  let closed = false;

  await new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      worker.terminate();
      reject(new Error(message));
    };
    worker.onerror = (event) => fail(event.message || "Direct writer failed to start.");
    worker.onmessage = (event: MessageEvent<DirectWriterResponse>) => {
      if (event.data.type === "ready") resolve();
      else fail(event.data.message);
    };
    worker.postMessage({
      type: "init",
      handle,
      controlBuffer,
      payloadBuffer,
      errorBuffer,
    });
  });
  worker.onerror = null;
  worker.onmessage = null;

  const command = (operation: number, offset = 0, length = 0): void => {
    if (closed) throw new Error("The direct destination is already closed.");
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError(`Invalid direct destination offset: ${offset}.`);
    }
    Atomics.store(control, DIRECT_ERROR_LENGTH, 0);
    Atomics.store(control, DIRECT_OPERATION, operation);
    Atomics.store(control, DIRECT_OFFSET_LOW, offset >>> 0);
    Atomics.store(control, DIRECT_OFFSET_HIGH, Math.floor(offset / 0x1_0000_0000));
    Atomics.store(control, DIRECT_LENGTH, length);
    Atomics.store(control, DIRECT_STATE, DIRECT_COMMAND);
    worker.postMessage({ type: "command" });
    const wait = Atomics.wait(
      control,
      DIRECT_STATE,
      DIRECT_COMMAND,
      DIRECT_COMMAND_TIMEOUT_MS,
    );
    const result = Atomics.load(control, DIRECT_STATE);
    if (wait === "timed-out" || result === DIRECT_COMMAND) {
      closed = true;
      worker.terminate();
      throw new Error("The selected destination did not finish a write within 120 seconds.");
    }
    const errorLength = Atomics.load(control, DIRECT_ERROR_LENGTH);
    const message =
      result === DIRECT_FAILED
        ? decoder.decode(errorBytes.subarray(0, errorLength))
        : "";
    Atomics.store(control, DIRECT_STATE, DIRECT_IDLE);
    if (result !== DIRECT_DONE) {
      throw new Error(message || "The selected destination rejected an operation.");
    }
  };

  const writeSync = (operation: DestinationWrite): boolean => {
    const source = operation instanceof Uint8Array ? operation : operation.data;
    const at =
      operation instanceof Uint8Array
        ? position
        : (operation.position ?? position);
    if (source.byteLength > payload.byteLength) {
      throw new RangeError(`Direct write exceeds ${payload.byteLength} bytes.`);
    }
    payload.set(source, 0);
    command(DIRECT_WRITE, at, source.byteLength);
    position = at + source.byteLength;
    return true;
  };

  return {
    requiresOwnedWriteBuffer: false,
    additionalWorkerCount: 1,
    sharedBufferBytes:
      controlBuffer.byteLength + payloadBuffer.byteLength + errorBuffer.byteLength,
    async write(operation) {
      writeSync(operation);
    },
    writeSync,
    async truncate(size) {
      command(DIRECT_TRUNCATE, size);
      if (position > size) position = size;
    },
    truncateSync(size) {
      command(DIRECT_TRUNCATE, size);
      if (position > size) position = size;
    },
    async flush() {},
    flushSync() {},
    async close() {
      command(DIRECT_CLOSE);
      closed = true;
      worker.terminate();
    },
    async abort() {
      try {
        if (!closed) command(DIRECT_ABORT);
      } finally {
        closed = true;
        worker.terminate();
      }
    },
  };
}

export function asynchronousFileStreamDestination(
  writable: FileSystemWritableFileStream,
  onAbort?: () => Promise<void>,
): RandomAccessDestination {
  let position = 0;
  let closed = false;

  return {
    requiresOwnedWriteBuffer: true,
    async write(operation) {
      const source = operation instanceof Uint8Array ? operation : operation.data;
      const at =
        operation instanceof Uint8Array
          ? position
          : (operation.position ?? position);
      if (at === position) {
        await writable.write(source);
      } else {
        await writable.write({ type: "write", position: at, data: source });
      }
      position = at + source.byteLength;
    },
    async truncate(size) {
      await writable.truncate(size);
      if (position > size) position = size;
    },
    async close() {
      await writable.close();
      closed = true;
    },
    async abort(reason) {
      try {
        if (!closed) await writable.abort(reason).catch(() => {});
      } finally {
        closed = true;
        await onAbort?.();
      }
    },
  };
}

export function syncOpfsDestination(
  initialAccess: FileSystemSyncAccessHandle,
  fileHandle: FileSystemFileHandle,
  root: FileSystemDirectoryHandle,
  name: string,
): RandomAccessDestination {
  let access = initialAccess;
  let position = 0;
  let closed = false;
  let unflushedBytes = 0;
  let bytesSinceReopen = 0;

  const closeAccess = (): void => {
    if (closed) return;
    access.close();
    closed = true;
  };

  const writeSync = (operation: DestinationWrite): boolean => {
    if (bytesSinceReopen >= SYNC_REOPEN_INTERVAL_BYTES) return false;
    const source = operation instanceof Uint8Array ? operation : operation.data;
    const at =
      operation instanceof Uint8Array
        ? position
        : (operation.position ?? position);
    const written = access.write(source, { at });
    if (written !== source.byteLength) {
      throw new Error(
        `OPFS synchronous write was incomplete: ${written} of ${source.byteLength} bytes.`,
      );
    }
    position = at + written;
    unflushedBytes += written;
    bytesSinceReopen += written;
    if (unflushedBytes >= SYNC_FLUSH_INTERVAL_BYTES) {
      access.flush();
      unflushedBytes = 0;
    }
    return true;
  };

  const rotate = async (): Promise<void> => {
    access.flush();
    access.close();
    access = await fileHandle.createSyncAccessHandle!();
    unflushedBytes = 0;
    bytesSinceReopen = 0;
  };

  return {
    requiresOwnedWriteBuffer: false,
    async write(operation) {
      if (!writeSync(operation)) {
        await rotate();
        if (!writeSync(operation)) {
          throw new Error("OPFS write still requires rotation after reopening.");
        }
      }
    },
    writeSync,
    rotate,
    async truncate(size) {
      access.truncate(size);
      if (position > size) position = size;
    },
    truncateSync(size) {
      access.truncate(size);
      if (position > size) position = size;
    },
    async flush() {
      access.flush();
      unflushedBytes = 0;
    },
    flushSync() {
      access.flush();
      unflushedBytes = 0;
    },
    async close() {
      access.flush();
      unflushedBytes = 0;
      closeAccess();
    },
    async abort() {
      try {
        access.truncate(0);
        access.flush();
      } finally {
        closeAccess();
        await root.removeEntry(name).catch(() => {});
      }
    },
  };
}
