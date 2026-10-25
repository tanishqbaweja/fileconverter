const nativeMetadataLimitErrors = new Set([
  "Bounded Ogg stream metadata copy failed: No space left on device",
  "Bounded Ogg cover serialization failed: No space left on device",
]);

/** Those two ENOSPC sites are in checked metadata construction, before header
 * output. Do not relabel a real destination/quota/permission/allocator failure.
 * Keep the original native detail for diagnosis; only add the correct cause.
 */
export function explainAudioMetadataBudgetError(message: string): string {
  if (!message.split(" | ").some(part => nativeMetadataLimitErrors.has(part))) return message;
  return "The tags and cover exceed a bounded metadata limit (4096 total fields, 2 MiB text, or 4095 bytes of cover description). " +
    "The conversion stopped without saving an output. Native detail: " + message;
}
