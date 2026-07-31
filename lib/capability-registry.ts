export type EngineId =
  | "compression-stream"
  | "archive-browser"
  | "document-stream"
  | "subtitle-stream"
  | "records-stream"
  | "image-browser"
  | "ffmpeg-remux"
  | "ffmpeg-audio"
  | "ffmpeg-video";

export type FormatCategory =
  | "compression"
  | "archive"
  | "subtitle"
  | "data"
  | "document"
  | "image"
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
    id: "tar",
    label: "TAR archive",
    extensions: ["tar"],
    mimeTypes: ["application/x-tar"],
    category: "archive",
  },
  {
    id: "tar-gz",
    label: "Compressed TAR (TAR.GZ)",
    extensions: ["tar.gz", "tgz"],
    mimeTypes: ["application/gzip", "application/x-gtar"],
    category: "archive",
  },
  {
    id: "zip",
    label: "ZIP archive",
    extensions: ["zip"],
    mimeTypes: ["application/zip", "application/x-zip-compressed"],
    category: "archive",
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
    id: "ass",
    label: "Advanced SubStation Alpha (ASS/SSA)",
    extensions: ["ass", "ssa"],
    mimeTypes: ["text/x-ssa", "text/x-ass"],
    category: "subtitle",
  },
  {
    id: "ttml",
    label: "Timed Text Markup Language (TTML)",
    extensions: ["ttml", "dfxp", "xml"],
    mimeTypes: ["application/ttml+xml"],
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
    id: "json",
    label: "JSON array",
    extensions: ["json"],
    mimeTypes: ["application/json"],
    category: "data",
  },
  {
    id: "txt",
    label: "Plain text",
    extensions: ["txt", "text"],
    mimeTypes: ["text/plain"],
    category: "document",
  },
  {
    id: "md",
    label: "Markdown",
    extensions: ["md", "markdown", "mdown"],
    mimeTypes: ["text/markdown"],
    category: "document",
  },
  {
    id: "html",
    label: "HTML",
    extensions: ["html", "htm"],
    mimeTypes: ["text/html"],
    category: "document",
  },
  {
    id: "png",
    label: "PNG image",
    extensions: ["png"],
    mimeTypes: ["image/png"],
    category: "image",
  },
  {
    id: "jpeg",
    label: "JPEG image",
    extensions: ["jpg", "jpeg"],
    mimeTypes: ["image/jpeg"],
    category: "image",
  },
  {
    id: "webp",
    label: "WebP image",
    extensions: ["webp"],
    mimeTypes: ["image/webp"],
    category: "image",
  },
  {
    id: "gif",
    label: "GIF image",
    extensions: ["gif"],
    mimeTypes: ["image/gif"],
    category: "image",
  },
  {
    id: "avif",
    label: "AVIF image",
    extensions: ["avif"],
    mimeTypes: ["image/avif"],
    category: "image",
  },
  {
    id: "bmp",
    label: "Bitmap image (BMP)",
    extensions: ["bmp", "dib"],
    mimeTypes: ["image/bmp"],
    category: "image",
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
    id: "mp3",
    label: "MP3 audio",
    extensions: ["mp3"],
    mimeTypes: ["audio/mpeg"],
    category: "audio",
  },
  {
    id: "flac",
    label: "FLAC audio",
    extensions: ["flac"],
    mimeTypes: ["audio/flac", "audio/x-flac"],
    category: "audio",
  },
  {
    id: "aiff",
    label: "AIFF audio",
    extensions: ["aiff", "aif", "aifc"],
    mimeTypes: ["audio/aiff", "audio/x-aiff"],
    category: "audio",
  },
  {
    id: "ogg",
    label: "Ogg Vorbis audio",
    extensions: ["ogg", "oga"],
    mimeTypes: ["audio/ogg"],
    category: "audio",
  },
  {
    id: "opus",
    label: "Opus audio",
    extensions: ["opus"],
    mimeTypes: ["audio/opus", "audio/ogg"],
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
  ["ndjson-to-json", "ndjson", "json"],
  ["json-to-ndjson", "json", "ndjson"],
] as const;

const recordMaxTestedBytes = {
  csv: 134_423_894,
  tsv: 134_423_894,
  ndjson: 288_143_880,
  json: 293_633_883,
} as const;

const imageProfiles = [
  ["png-to-jpeg", "png", "jpeg"],
  ["png-to-webp", "png", "webp"],
  ["jpeg-to-png", "jpeg", "png"],
  ["jpeg-to-webp", "jpeg", "webp"],
  ["webp-to-png", "webp", "png"],
  ["webp-to-jpeg", "webp", "jpeg"],
  ["gif-to-png", "gif", "png"],
  ["gif-to-jpeg", "gif", "jpeg"],
  ["gif-to-webp", "gif", "webp"],
  ["avif-to-png", "avif", "png"],
  ["avif-to-jpeg", "avif", "jpeg"],
  ["avif-to-webp", "avif", "webp"],
  ["bmp-to-png", "bmp", "png"],
  ["bmp-to-jpeg", "bmp", "jpeg"],
  ["bmp-to-webp", "bmp", "webp"],
  ["png-to-bmp", "png", "bmp"],
  ["jpeg-to-bmp", "jpeg", "bmp"],
  ["webp-to-bmp", "webp", "bmp"],
  ["gif-to-bmp", "gif", "bmp"],
  ["avif-to-bmp", "avif", "bmp"],
] as const;

const imageMaxTestedBytes = {
  png: 780_611,
  jpeg: 418_486,
  webp: 263_320,
  gif: 281_853,
  avif: 100_464,
  bmp: 24_883_254,
} as const;

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
    metadataLimitations: [
      "The original filename is inferred from the .gz suffix.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_399,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-to-tar-gz",
    input: "tar",
    output: "tar-gz",
    engine: "compression-stream",
    route: "stream",
    browserRequirements: ["CompressionStream", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "This bounded route accepts UTF-8 USTAR headers and rejects GNU/PAX extended records.",
      "Archives are validated but not extracted; the original TAR entry bytes are preserved.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_436_992,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-gz-to-tar",
    input: "tar-gz",
    output: "tar",
    engine: "compression-stream",
    route: "stream",
    browserRequirements: ["DecompressionStream", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "This bounded route accepts UTF-8 USTAR headers and rejects GNU/PAX extended records.",
      "Archives are validated but not extracted; the original TAR entry bytes are preserved.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_551,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "zip-to-tar",
    input: "zip",
    output: "tar",
    engine: "archive-browser",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts ZIP32 archives with stored or DEFLATE entries and UTF-8 or ASCII names.",
      "Rejects encryption, ZIP64, multi-disk archives, links, special files, duplicate names, and unsafe paths.",
      "The bounded USTAR destination cannot preserve ZIP comments, extra fields, or permissions.",
      "Expansion stops above 64 GiB, 10,000 entries, or a 100:1 ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_517,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-to-zip",
    input: "tar",
    output: "zip",
    engine: "archive-browser",
    route: "stream",
    browserRequirements: [
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts bounded UTF-8 USTAR files and directories; rejects GNU/PAX extensions, links, special files, duplicate names, and unsafe paths.",
      "Writes deterministic ZIP32 DEFLATE output and does not preserve USTAR owners, groups, modes, or device fields.",
      "ZIP64 output is not supported, so each entry and the completed ZIP must remain below 4 GiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_436_992,
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
    maxTestedBytes: 67_327_792,
    automatedTestStatus: "passed",
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
    maxTestedBytes: 73_788_904,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ass-to-srt",
    input: "ass",
    output: "srt",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "ASS script metadata, styles, positioning, karaoke, and effects are not representable in SRT.",
    ],
    fidelityLimitations: [
      "Dialogue text and speaker names are preserved; ASS override tags are removed.",
    ],
    maxTestedBytes: 101_393_068,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ass-to-vtt",
    input: "ass",
    output: "vtt",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "ASS script metadata, styles, positioning, karaoke, and effects are not represented in this WebVTT profile.",
    ],
    fidelityLimitations: [
      "Dialogue text and speaker names are preserved; ASS override tags are removed.",
    ],
    maxTestedBytes: 101_393_068,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "srt-to-ttml",
    input: "srt",
    output: "ttml",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "SRT has no TTML regions, style sheets, language metadata, or document metadata.",
    ],
    fidelityLimitations: [
      "Cue timing, line breaks, voice labels, and basic italic, bold, and underline markup are represented.",
    ],
    maxTestedBytes: 67_327_792,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "vtt-to-ttml",
    input: "vtt",
    output: "ttml",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "WebVTT regions, cue positioning, header metadata, and CSS classes are not represented.",
    ],
    fidelityLimitations: [
      "Cue timing, line breaks, voice labels, and basic italic, bold, and underline markup are represented.",
    ],
    maxTestedBytes: 73_788_904,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ttml-to-srt",
    input: "ttml",
    output: "srt",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts UTF-8 TTML with clock, seconds, or millisecond time expressions; DTDs and custom entities are rejected.",
      "TTML regions, animations, metadata, and advanced styling are not representable in SRT.",
    ],
    fidelityLimitations: [
      "Basic italic, bold, underline, and line-break markup is preserved.",
    ],
    maxTestedBytes: 82_349_061,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ttml-to-vtt",
    input: "ttml",
    output: "vtt",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts UTF-8 TTML with clock, seconds, or millisecond time expressions; DTDs and custom entities are rejected.",
      "TTML regions, animations, metadata, and advanced styling are not represented in this WebVTT profile.",
    ],
    fidelityLimitations: [
      "Basic italic, bold, underline, and line-break markup is preserved.",
    ],
    maxTestedBytes: 82_349_061,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "txt-to-html",
    input: "txt",
    output: "html",
    engine: "document-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Plain text has no document title, language, semantic headings, links, or embedded media metadata.",
    ],
    fidelityLimitations: [
      "Text and whitespace are preserved in a safe preformatted HTML document.",
    ],
    maxTestedBytes: 67_130_000,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "md-to-html",
    input: "md",
    output: "html",
    engine: "document-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "YAML front matter, footnotes, tables, task lists, definition lists, and Markdown extensions are not interpreted.",
      "Raw HTML is escaped instead of executed.",
    ],
    fidelityLimitations: [
      "Supports bounded headings, paragraphs, lists, blockquotes, rules, fenced code, links, emphasis, strong text, and inline code.",
    ],
    maxTestedBytes: 141_110_000,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "html-to-txt",
    input: "html",
    output: "txt",
    engine: "document-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Scripts, styles, templates, SVG, canvas, metadata, layout, images, links, and form controls are removed.",
      "The bounded decoder accepts numeric entities and amp, apos, gt, lt, nbsp, and quot named entities.",
    ],
    fidelityLimitations: [
      "Visible text, block boundaries, basic lists, and table cell boundaries are retained.",
    ],
    maxTestedBytes: 143_850_123,
    automatedTestStatus: "passed",
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
    metadataLimitations: [
      "Records larger than 1 MiB or wider than 4,096 fields are rejected to enforce the memory budget.",
      ...(input === "ndjson" && output !== "json"
        ? [
            "Columns are fixed by the first object; later extra keys are reported and ignored.",
          ]
        : (input === "csv" || input === "tsv") && output === "ndjson"
          ? [
              "Delimited fields are emitted as JSON strings; this route does not guess numeric, Boolean, or null types.",
              "Fields beyond the header width are reported and ignored; missing fields become empty strings.",
            ]
          : []),
    ],
    fidelityLimitations:
      input === "json" || output === "json"
        ? [
            "JSON whitespace and equivalent lexical representations are normalized during streaming serialization.",
          ]
        : [],
    maxTestedBytes: recordMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...imageProfiles.map(([id, input, output]) => ({
    id,
    input,
    output,
    engine: "image-browser" as const,
    route: "re-encode" as const,
    browserRequirements: [
      "ImageDecoder",
      "OffscreenCanvas",
      "File System Access",
    ],
    cpuClass: "medium" as const,
    memoryClass: "bounded-medium" as const,
    metadataLimitations: [
      "EXIF, ICC profiles, textual metadata, and animation are not preserved by this bounded still-image profile.",
    ],
    fidelityLimitations:
      output === "jpeg"
        ? ["JPEG output is lossy and cannot preserve transparency."]
        : output === "webp"
          ? ["WebP output uses lossy quality 0.90."]
          : output === "bmp"
            ? ["BMP output uses 24-bit color and cannot preserve transparency."]
          : [],
    maxTestedBytes: imageMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
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
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Lossless stream copy accepts H.264 or HEVC video with AAC audio; other source codecs are rejected unless a separately verified re-encoding route is selected.",
      "SRT subtitles and container-incompatible attachments are explicitly excluded.",
      "Source chapters are not copied by this initial fragmented-MP4 profile.",
    ],
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
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Lossless M4A extraction accepts AAC audio; other source audio codecs require a separately verified re-encoding route.",
      "Video, subtitle, and attachment streams are explicitly excluded from the audio-only destination.",
      "Source chapters are not copied into this initial M4A profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 2_958_573_265,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mp4-to-m4a",
    input: "mp4",
    output: "m4a",
    engine: "ffmpeg-remux",
    route: "stream-copy",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Lossless M4A extraction accepts AAC audio; other source audio codecs require a separately verified re-encoding route.",
      "Video, subtitle, and cover-art streams are explicitly excluded from the audio-only destination.",
      "Source chapters are not copied into this initial M4A profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 2_964_855_971,
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
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Only the first audio stream is converted.",
      "Video, subtitle, and attachment streams are explicitly excluded.",
      "WAV cannot preserve every Matroska language or container tag.",
      "Source chapters are not copied into WAV.",
    ],
    fidelityLimitations: [
      "AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 2_958_573_265,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "m4a-to-wav",
    input: "m4a",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Only the first audio stream is converted.",
      "WAV cannot preserve every MPEG-4 language, artwork, or container tag.",
      "Source chapters are not copied into WAV.",
    ],
    fidelityLimitations: [
      "AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 36_929_878,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mp3-to-wav",
    input: "mp3",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "This bounded PCM profile does not carry MP3 ID3 tags or embedded artwork into WAV.",
    ],
    fidelityLimitations: [
      "MP3 is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 50_401_224,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "flac-to-wav",
    input: "flac",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "This bounded PCM profile does not carry FLAC tags or embedded artwork into WAV.",
    ],
    fidelityLimitations: [
      "Samples are represented as signed 16-bit little-endian PCM; higher FLAC bit depths are reduced.",
    ],
    maxTestedBytes: 52_298_514,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "aiff-to-wav",
    input: "aiff",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "This initial route accepts signed 16-bit big-endian PCM AIFF input.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 201_600_102,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ogg-to-wav",
    input: "ogg",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Vorbis comments and artwork are not carried into this PCM WAV profile.",
    ],
    fidelityLimitations: [
      "Vorbis is decoded and represented as signed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 4_580_949,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "opus-to-wav",
    input: "opus",
    output: "wav",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Opus tags and artwork are not carried into this PCM WAV profile.",
    ],
    fidelityLimitations: [
      "Opus is decoded and represented as signed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 40_289_464,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "m4a-to-flac",
    input: "m4a",
    output: "flac",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Container-specific MPEG-4 metadata and artwork are not carried into this FLAC profile.",
    ],
    fidelityLimitations: [
      "AAC is lossy; FLAC preserves the decoded 16-bit PCM but cannot restore discarded source information.",
    ],
    maxTestedBytes: 36_929_878,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mp3-to-flac",
    input: "mp3",
    output: "flac",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "ID3 metadata and embedded artwork are not carried into this FLAC profile.",
    ],
    fidelityLimitations: [
      "MP3 is lossy; FLAC preserves the decoded 16-bit PCM but cannot restore discarded source information.",
    ],
    maxTestedBytes: 50_401_224,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "wav-to-flac",
    input: "wav",
    output: "flac",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "This initial route accepts signed 16-bit little-endian PCM WAV input.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 201_600_106,
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
    metadataLimitations: [
      "This initial profile converts only the first non-attached video stream.",
      "AAC audio, subtitles, attachments, and additional video streams are explicitly excluded.",
      "Source chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
    ],
    fidelityLimitations: [
      "Video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy VP8 at 600 kbit/s.",
    ],
    maxTestedBytes: 2_958_573_265,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mkv-to-mp4-mpeg4",
    input: "mkv",
    output: "mp4-mpeg4",
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
    metadataLimitations: [
      "This initial specialist profile converts only the first video stream.",
      "Audio, subtitles, and attachments are explicitly excluded.",
      "Source chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
    ],
    fidelityLimitations: [
      "Video is decoded and encoded as lossy MPEG-4 Part 2 at 2 Mbit/s.",
      "Only YUV 4:2:0 source frames are currently accepted.",
    ],
    maxTestedBytes: 936_003,
    automatedTestStatus: "pending",
    public: true,
  },
];

export function formatById(id: string): FormatDefinition | undefined {
  return formats.find((format) => format.id === id);
}

export function detectFormat(file: Pick<File, "name" | "type">): string {
  const lowerName = file.name.toLowerCase();
  const compoundFormat = formats.find((format) =>
    format.extensions.some(
      (extension) =>
        extension.includes(".") && lowerName.endsWith(`.${extension}`),
    ),
  );
  if (compoundFormat) return compoundFormat.id;
  const extension = lowerName.split(".").pop() ?? "";
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
