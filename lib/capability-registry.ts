export type EngineId =
  | "compression-stream"
  | "subtitle-stream"
  | "records-stream"
  | "ffmpeg-remux"
  | "ffmpeg-audio"
  | "ffmpeg-video";

export type FormatCategory =
  | "compression"
  | "subtitle"
  | "data"
  | "video"
  | "audio";

export interface FormatDefinition {
  id: string;
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  category: FormatCategory;
}

export type AutomatedTestStatus = "passed" | "pending" | "failed";

export interface ConversionProfile {
  id: string;
  input: string;
  output: string;
  engine: EngineId;
  route: "stream" | "stream-copy" | "re-encode";
  browserRequirements: readonly string[];
  cpuClass: "low" | "medium" | "high";
  memoryClass: "bounded-low" | "bounded-medium";
  metadataLimitations: readonly string[];
  fidelityLimitations: readonly string[];
  maxTestedBytes: number | null;
  automatedTestStatus: AutomatedTestStatus;
  public: boolean;
}

export const formats = [
  {
    id: "binary",
    label: "Original bytes",
    extensions: [],
    mimeTypes: ["application/octet-stream"],
    category: "compression",
  },
  {
    id: "gzip",
    label: "GZIP",
    extensions: ["gz", "gzip"],
    mimeTypes: ["application/gzip", "application/x-gzip"],
    category: "compression",
  },
  {
    id: "srt",
    label: "SubRip (SRT)",
    extensions: ["srt"],
    mimeTypes: ["application/x-subrip", "text/srt"],
    category: "subtitle",
  },
  {
    id: "vtt",
    label: "WebVTT",
    extensions: ["vtt"],
    mimeTypes: ["text/vtt"],
    category: "subtitle",
  },
  {
    id: "csv",
    label: "CSV",
    extensions: ["csv"],
    mimeTypes: ["text/csv"],
    category: "data",
  },
  {
    id: "tsv",
    label: "TSV",
    extensions: ["tsv", "tab"],
    mimeTypes: ["text/tab-separated-values"],
    category: "data",
  },
  {
    id: "ndjson",
    label: "NDJSON",
    extensions: ["ndjson", "jsonl"],
    mimeTypes: ["application/x-ndjson", "application/jsonl"],
    category: "data",
  },
  {
    id: "mkv",
    label: "Matroska video",
    extensions: ["mkv"],
    mimeTypes: ["video/x-matroska"],
    category: "video",
  },
  {
    id: "mp4",
    label: "MP4 video",
    extensions: ["mp4", "m4v"],
    mimeTypes: ["video/mp4"],
    category: "video",
  },
  {
    id: "m4a",
    label: "MPEG-4 audio (M4A)",
    extensions: ["m4a"],
    mimeTypes: ["audio/mp4"],
    category: "audio",
  },
  {
    id: "wav",
    label: "Waveform audio (WAV)",
    extensions: ["wav"],
    mimeTypes: ["audio/wav", "audio/x-wav"],
    category: "audio",
  },
  {
    id: "webm",
    label: "WebM video",
    extensions: ["webm"],
    mimeTypes: ["video/webm"],
    category: "video",
  },
  {
    id: "mp4-mpeg4",
    label: "MP4 (MPEG-4 video)",
    extensions: ["mp4"],
    mimeTypes: ["video/mp4"],
    category: "video",
  },
] as const satisfies readonly FormatDefinition[];

const recordProfiles = [
  ["csv-to-tsv", "csv", "tsv"],
  ["tsv-to-csv", "tsv", "csv"],
  ["csv-to-ndjson", "csv", "ndjson"],
  ["tsv-to-ndjson", "tsv", "ndjson"],
  ["ndjson-to-csv", "ndjson", "csv"],
  ["ndjson-to-tsv", "ndjson", "tsv"],
] as const;

export const conversionProfiles: readonly ConversionProfile[] = [
  {
    id: "gzip-compress",
    input: "binary",
    output: "gzip",
    engine: "compression-stream",
    route: "stream",
    browserRequirements: ["CompressionStream", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: ["GZIP stores a single byte stream, not a directory tree."],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_456,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "gzip-decompress",
    input: "gzip",
    output: "binary",
    engine: "compression-stream",
    route: "stream",
    browserRequirements: ["DecompressionStream", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: ["The original filename is inferred from the .gz suffix."],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_399,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "srt-to-vtt",
    input: "srt",
    output: "vtt",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [],
    fidelityLimitations: ["SRT has no native WebVTT cue-setting metadata."],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: true,
  },
  {
    id: "vtt-to-srt",
    input: "vtt",
    output: "srt",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: ["WebVTT header metadata is not representable in SRT."],
    fidelityLimitations: ["Cue positioning and region settings are removed."],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: true,
  },
  ...recordProfiles.map(([id, input, output]) => ({
    id,
    input,
    output,
    engine: "records-stream" as const,
    route: "stream" as const,
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low" as const,
    memoryClass: "bounded-low" as const,
    metadataLimitations:
      input === "ndjson"
        ? ["Columns are fixed by the first object; later extra keys are reported and ignored."]
        : [],
    fidelityLimitations: [],
    maxTestedBytes: null,
    automatedTestStatus: "pending" as const,
    public: true,
  })),
  {
    id: "mkv-to-mp4",
    input: "mkv",
    output: "mp4",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [
      "WebAssembly",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: ["Container-incompatible attachments require explicit exclusion."],
    fidelityLimitations: [],
    maxTestedBytes: 10_737_988_703,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mkv-to-m4a",
    input: "mkv",
    output: "m4a",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [
      "WebAssembly",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Video, subtitle, and attachment streams are explicitly excluded from the audio-only destination.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 2_958_573_265,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mkv-to-wav",
    input: "mkv",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Only the first audio stream is converted.",
      "Video, subtitle, and attachment streams are explicitly excluded.",
      "WAV cannot preserve every Matroska language or container tag.",
    ],
    fidelityLimitations: [
      "AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 2_958_573_265,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mkv-to-webm",
    input: "mkv",
    output: "webm",
    engine: "ffmpeg-video",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "high",
    memoryClass: "bounded-medium",
    metadataLimitations: ["Attachments and unsupported subtitle types require explicit exclusion."],
    fidelityLimitations: ["Lossy video and audio re-encoding is required for incompatible codecs."],
    maxTestedBytes: null,
    automatedTestStatus: "pending",
    public: false,
  },
  {
    id: "mkv-to-mp4-mpeg4",
    input: "mkv",
    output: "mp4-mpeg4",
    engine: "ffmpeg-video",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "high",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "This initial specialist profile converts only the first video stream.",
      "Audio, subtitles, and attachments are explicitly excluded.",
    ],
    fidelityLimitations: [
      "Video is decoded and encoded as lossy MPEG-4 Part 2 at 2 Mbit/s.",
      "Only YUV 4:2:0 source frames are currently accepted.",
    ],
    maxTestedBytes: 936_003,
    automatedTestStatus: "passed",
    public: true,
  },
];

export function formatById(id: string): FormatDefinition | undefined {
  return formats.find((format) => format.id === id);
}

export function detectFormat(file: Pick<File, "name" | "type">): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    formats.find((format) => format.extensions.includes(extension as never))?.id ??
    formats.find((format) => format.mimeTypes.includes(file.type as never))?.id ??
    "binary"
  );
}

export function publicProfilesFor(
  input: string,
  includePending = false,
): readonly ConversionProfile[] {
  return conversionProfiles.filter(
    (profile) =>
      profile.public &&
      (profile.input === input ||
        (profile.id === "gzip-compress" && input !== "gzip")) &&
      (includePending || profile.automatedTestStatus === "passed"),
  );
}
