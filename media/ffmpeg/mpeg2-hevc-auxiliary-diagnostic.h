/* Private scalar inventory:48 events plus192 plane events <=240 browser cap.
 * Native reader walks at most128 inactive links. The48-byte stack view below
 * is copied into scalar fields synchronously; never retained or sent as media.
 */
void within_hevc_aux_diagnostic(const AVCodecContext *context);
EM_JS(void, within_hevc_aux_emit,
      (unsigned sequence, unsigned layer, unsigned active, unsigned short_refs,
       unsigned long_refs, unsigned output, const size_t *values), {
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
    callback({ kind: "hevc-auxiliary-pools", sequence, phase: "before-encoder-send",
      layer, activeDpbFrames: active, shortReferenceFrames: short_refs,
      longReferenceFrames: long_refs, outputPendingFrames: output, pools,
      scope: "simultaneous-read-only-pools-not-free-blocks-not-acceptance" });
  } catch { console.debug("WITHIN_HEVC_AUX_UNAVAILABLE"); }
});
