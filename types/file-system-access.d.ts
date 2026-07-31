interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: FileSystemHandle | string;
}

interface Window {
  showSaveFilePicker?: (
    options?: SaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (
    options?: DirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>;
  __withinValidationChunk?: (base64: string) => Promise<void>;
}

interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  createWritable(options?: {
    keepExistingData?: boolean;
  }): Promise<FileSystemWritableFileStream>;
  getFile(): Promise<File>;
  createSyncAccessHandle?: () => Promise<FileSystemSyncAccessHandle>;
}

interface FileSystemSyncAccessHandle {
  write(
    buffer: BufferSource,
    options?: { at?: number },
  ): number;
  truncate(newSize: number): void;
  flush(): void;
  close(): void;
}

interface FileSystemDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  entries(): AsyncIterableIterator<
    [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  >;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  removeEntry(
    name: string,
    options?: { recursive?: boolean },
  ): Promise<void>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(
    data:
      | BufferSource
      | Blob
      | string
      | {
          type: "write";
          position?: number;
          data: BufferSource | Blob | string;
        }
      | { type: "seek"; position: number }
      | { type: "truncate"; size: number },
  ): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}
