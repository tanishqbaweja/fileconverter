/** Independent FFprobe tag validation; scopes are explicit and never merged. */
export interface ScopedAudioTagOptions {
  scope: "format" | "audio-stream";
  audioOrdinal?: number;
}
export interface ScopedAudioTagField {
  field: string;
  expectedValue: string;
  actualKey: string | null;
  actualValue: string | null;
  status: "missing" | "preserved" | "changed";
}
export interface ScopedAudioTagResult {
  status: "passed" | "failed";
  scope: "format" | "audio-stream";
  audioOrdinal: number | null;
  streamIndex: number | null;
  observedTagCount: number;
  fields: ScopedAudioTagField[];
}
// unknown is deliberate: runtime checks validate untrusted probe dictionaries.
// Omitting the scope throws at runtime; declarations must not allow that call.
export function validateScopedAudioTags(
  probe: unknown,
  expected: unknown,
  options: ScopedAudioTagOptions,
): ScopedAudioTagResult;
