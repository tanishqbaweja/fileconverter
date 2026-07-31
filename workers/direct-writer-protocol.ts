export const DIRECT_WRITER_PAYLOAD_BYTES = 256 * 1024;
export const DIRECT_WRITER_ERROR_BYTES = 4 * 1024;
export const DIRECT_WRITER_CONTROL_WORDS = 8;

export const DIRECT_STATE = 0;
export const DIRECT_OPERATION = 1;
export const DIRECT_OFFSET_LOW = 2;
export const DIRECT_OFFSET_HIGH = 3;
export const DIRECT_LENGTH = 4;
export const DIRECT_ERROR_LENGTH = 5;

export const DIRECT_IDLE = 0;
export const DIRECT_COMMAND = 1;
export const DIRECT_DONE = 2;
export const DIRECT_FAILED = 3;

export const DIRECT_WRITE = 1;
export const DIRECT_TRUNCATE = 2;
export const DIRECT_CLOSE = 3;
export const DIRECT_ABORT = 4;

export interface DirectWriterInitMessage {
  type: "init";
  handle: FileSystemFileHandle;
  controlBuffer: SharedArrayBuffer;
  payloadBuffer: SharedArrayBuffer;
  errorBuffer: SharedArrayBuffer;
}

export interface DirectWriterCommandMessage {
  type: "command";
}

export type DirectWriterRequest =
  | DirectWriterInitMessage
  | DirectWriterCommandMessage;

export type DirectWriterResponse =
  | { type: "ready" }
  | { type: "init-error"; message: string };
