export type DestinationWrite =
  | Uint8Array<ArrayBuffer>
  | {
      type: "write";
      position?: number;
      data: Uint8Array<ArrayBuffer>;
    };

export interface RandomAccessDestination {
  requiresOwnedWriteBuffer: boolean;
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
