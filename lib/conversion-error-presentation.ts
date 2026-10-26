export const BROWSER_STORAGE_WRITE_ERROR_SUMMARY =
  "Browser storage could not finish writing this file. Check available disk space and browser storage limits, then retry.";
export const STORAGE_ERROR_CLASSIFICATION_CHARACTERS = 512;

/** Display-only classification of the observed browser API error. A generic
 * ENOSPC, codec allocation error or metadata budget rejection is not enough.
 * Keep the original message by reference, without truncating native evidence.
 */
export function presentConversionError(message: string): {
  summary: string;
  nativeDetail: string | null;
} {
  const prefix = message.slice(0, STORAGE_ERROR_CLASSIFICATION_CHARACTERS);
  const privateStorageWriteFailed =
    /^Failed to execute ['"](?:write|truncate|flush)['"] on ['"]FileSystemSyncAccessHandle['"]:\s*(?:No space available|The quota has been exceeded|Quota exceeded)/i.test(prefix);
  return privateStorageWriteFailed
    ? { summary: BROWSER_STORAGE_WRITE_ERROR_SUMMARY, nativeDetail: message }
    : { summary: message, nativeDetail: null };
}
