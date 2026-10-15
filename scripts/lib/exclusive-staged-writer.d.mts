export function createExclusiveStagedWriter(stream: FileSystemWritableFileStream):
  Pick<FileSystemWritableFileStream, "write" | "truncate" | "close" | "abort"> & {
    writerMetrics(): {
      phase: string; locks: number; releases: number; writes: number;
      maximumWriteBytes: number; pendingOperations: number; retainedWriter: boolean;
      retainedStream: boolean; additionalCopyBufferBytes: 0; queuedChunks: 0;
    };
  };
