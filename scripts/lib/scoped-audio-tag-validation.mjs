// Independent FFprobe metadata validation, not conversion or a preservation policy.
// Never merge scopes: a format tag cannot conceal a missing selected-stream tag.
const MAX_STREAMS = 64, MAX_TAGS = 128, MAX_EXPECTED = 32;
const MAX_KEY_CHARACTERS = 128, MAX_VALUE_CHARACTERS = 4096;

function dictionary(value, label, maximum) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be a tag dictionary`);
  const normalized = new Map();
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (normalized.size >= maximum) throw new RangeError(`${label} tag count exceeds ${maximum}`);
    const text = value[key];
    if (!key.length || key.length > MAX_KEY_CHARACTERS || key.includes("\0"))
      throw new RangeError(`${label} tag key exceeds its bound or is invalid`);
    if (typeof text !== "string" || text.length > MAX_VALUE_CHARACTERS || text.includes("\0"))
      throw new TypeError(`${label} tag value must be bounded text`);
    const canonical = key.toLowerCase();
    if (normalized.has(canonical)) throw new Error(`${label} has ambiguous case-folded tag keys`);
    normalized.set(canonical, { key, value: text });
  }
  return normalized;
}

export function validateScopedAudioTags(probe, expected, { scope, audioOrdinal = 0 } = {}) {
  if (!probe || typeof probe !== "object" || Array.isArray(probe))
    throw new TypeError("FFprobe result must be an object");
  if (scope !== "format" && scope !== "audio-stream") throw new Error("Explicit metadata scope required");
  if (!Number.isSafeInteger(audioOrdinal) || audioOrdinal < 0 || audioOrdinal >= MAX_STREAMS)
    throw new RangeError("Audio ordinal exceeds its bound or is invalid");
  const wanted = dictionary(expected, "Expected", MAX_EXPECTED);
  if (!wanted.size) throw new Error("At least one expected metadata field required");
  let holder, streamIndex = null;
  if (scope === "format") {
    if (audioOrdinal !== 0) throw new Error("Audio ordinal is not applicable to format metadata");
    holder = probe.format;
  } else {
    if (!Array.isArray(probe.streams) || probe.streams.length > MAX_STREAMS)
      throw new RangeError("FFprobe streams must be an array within the stream bound");
    let ordinal = 0;
    for (const stream of probe.streams) {
      if (!stream || typeof stream !== "object" || Array.isArray(stream))
        throw new TypeError("Malformed FFprobe stream");
      if (stream.codec_type !== "audio") continue;
      if (ordinal++ === audioOrdinal) { holder = stream; break; }
    }
    if (!holder) throw new Error("Selected audio stream is unavailable; no scope fallback");
    if (!Number.isSafeInteger(holder.index) || holder.index < 0)
      throw new TypeError("Selected audio stream index is unavailable or invalid");
    streamIndex = holder.index;
  }
  if (!holder || typeof holder !== "object" || Array.isArray(holder))
    throw new TypeError("Selected metadata holder is unavailable");
  // FFprobe omits tags when none exist. Explicit null/malformed tags are errors.
  const actual = dictionary(holder.tags === undefined ? {} : holder.tags, "Observed", MAX_TAGS);
  const fields = [...wanted].map(([canonical, entry]) => {
    const observed = actual.get(canonical);
    return { field: entry.key, expectedValue: entry.value,
      actualKey: observed?.key ?? null, actualValue: observed?.value ?? null,
      status: !observed ? "missing" : observed.value === entry.value ? "preserved" : "changed" };
  });
  return { status: fields.every(field => field.status === "preserved") ? "passed" : "failed",
    scope, audioOrdinal: scope === "audio-stream" ? audioOrdinal : null, streamIndex,
    observedTagCount: actual.size, fields };
}
