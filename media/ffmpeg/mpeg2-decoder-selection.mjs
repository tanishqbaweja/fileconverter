// Additional private module, not removal of the broad/default input coverage.
export function selectMpeg2Decoders(value = "wide") {
  const sets = {
    wide: { requested: "h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9",
      enabled: ["h263", "h264", "hevc", "mpeg2video", "mpeg4", "theora", "vp3", "vp8", "vp9"] },
    "hevc-mpeg4": { requested: "hevc,mpeg4", enabled: ["h263", "hevc", "mpeg4"] },
  };
  if (typeof value !== "string" || !Object.hasOwn(sets, value))
    throw new Error("Private MPEG2 decoder set must be wide or hevc-mpeg4");
  return { name: value, requested: sets[value].requested, enabled: [...sets[value].enabled] };
}

export function verifyMpeg2DecoderSet(value, enabled) {
  const selected = selectMpeg2Decoders(value);
  if (!Array.isArray(enabled) || JSON.stringify(enabled) !== JSON.stringify(selected.enabled))
    throw new Error("Actual compiled decoder set differs from the private module selection");
  return selected;
}
