/* Private read-only before/after plane trace, independent of malloc strategy.
 * At most192 scalar events; no addresses, media bytes, extra buffers, allocator
 * inspection, reference changes or codec/layout/quality/heap modifications.
 */
EM_JS(void, within_mpeg2_plane_emit,
      (unsigned sequence, int phase, int codec_id, int encoder,
       int context_width, int context_height, int coded_width, int coded_height,
       int width, int height, int format, int plane, unsigned requested_bytes,
       int linesize, unsigned allocated_bytes, int success), {
  const callback = Module["withinBridge"]?.allocatorDiagnostic;
  if (typeof callback !== "function") return;
  try {
    callback({ kind: "frame-plane-allocation", sequence,
      phase: phase === 0 ? "before" : "after", codecId: codec_id,
      encoder: Boolean(encoder), contextWidth: context_width, contextHeight: context_height,
      codedWidth: coded_width, codedHeight: coded_height, width, height,
      pixelFormat: format, plane, requestedBytes: requested_bytes, linesize,
      frameBufferBytes: allocated_bytes, succeeded: phase === 0 ? null : Boolean(success),
      scope: "scalar-request-not-heap-free-space-not-acceptance" });
  } catch { console.debug("WITHIN_MPEG2_PLANE_UNAVAILABLE"); }
});

void within_mpeg2_plane_diagnostic(const AVCodecContext *s, const AVFrame *pic,
                                  int plane, size_t bytes, int linesize, int phase) {
  static unsigned sequence;
  if (sequence >= 192) return;
  size_t allocated_bytes = 0;
  for (unsigned i = 0; i < AV_NUM_DATA_POINTERS; i++)
    if (pic->buf[i]) allocated_bytes += pic->buf[i]->size;
  within_mpeg2_plane_emit(++sequence, phase, s->codec_id, av_codec_is_encoder(s->codec),
      s->width, s->height, s->coded_width, s->coded_height, pic->width, pic->height,
      pic->format, plane, bytes, linesize, allocated_bytes, pic->buf[plane] != NULL);
}
