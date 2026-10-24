export const MAX_BATCH_FILES = 256;
export const MAX_RETAINED_WARNINGS = 8;
export const MAX_WORKER_RESPONSE_TEXT_CHARS = 2_048;
export const MAX_PROGRESS_PHASE_CHARS = 256;
export const MIN_PROGRESS_INTERVAL_MS = 125;
/** Actual reusable buffer owned by the separate Wasm-free final saver. */
export const STAGED_SAVE_COPY_CHUNK_BYTES = 512 * 1024;
