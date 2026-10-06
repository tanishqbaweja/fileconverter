/* Allocation-time scalar observer: shared48 HEVC events +192planes <=240.
 * The synchronous48-byte stack view is copied only into scalar fields. */
void within_hevc_aux_diagnostic(const AVCodecContext *context);
EM_JS(void, within_hevc_aux_emit_js,
      (unsigned sequence, unsigned layer, unsigned phase, unsigned which,
       unsigned succeeded, unsigned active, unsigned short_refs, unsigned long_refs,
       unsigned output, const size_t *values), {
  const callback = Module["withinBridge"]?.allocatorDiagnostic;
  if (typeof callback !== "function") return;
  try {
    const base = values >>> 2;
    const names = ["tab_mvf", "rpl_tab"];
    const pools = names.map((name, index) => {
      const offset = base + index * 6;
      const configured = Boolean(HEAPU32[offset]);
      const complete = configured && Boolean(HEAPU32[offset + 1]);
      return { name, configured, statisticsComplete: complete,
        payloadBytes: configured ? HEAPU32[offset + 2] : null,
        backingBytesPerEntry: complete ? HEAPU32[offset + 3] : null,
        liveEntries: complete ? HEAPU32[offset + 4] : null,
        cachedEntries: complete ? HEAPU32[offset + 5] : null };
    });
    callback({ kind: "hevc-pool-event", sequence,
      phase: ["before-encoder-send", "before-pool-get", "after-pool-get"][phase] ?? null,
      requestPool: phase === 0 ? null : names[which] ?? null,
      succeeded: phase === 2 ? Boolean(succeeded) : null,
      layer, activeDpbFrames: active, shortReferenceFrames: short_refs,
      longReferenceFrames: long_refs, outputPendingFrames: output, pools,
      scope: "allocation-time-read-only-pools-not-free-blocks-not-acceptance" });
  } catch { console.debug("WITHIN_HEVC_POOL_ATTEMPT_UNAVAILABLE"); }
});
/* Real C archive bridge directly retains the EM_JS import under LTO. */
void within_hevc_aux_emit(unsigned sequence, unsigned layer, unsigned phase,
                          unsigned which, unsigned succeeded, unsigned active,
                          unsigned short_refs, unsigned long_refs, unsigned output,
                          const size_t *values)
{
    within_hevc_aux_emit_js(sequence, layer, phase, which, succeeded, active,
                           short_refs, long_refs, output, values);
}
