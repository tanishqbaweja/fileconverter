export type EngineId =
  | "compression-stream"
  | "bzip2-wasm"
  | "xz-wasm"
  | "compression-codec-pipeline"
  | "archive-codec-pipeline"
  | "libarchive7z-wasm"
  | "archive-browser"
  | "document-stream"
  | "ebook-stream"
  | "odf-stream"
  | "presentation-stream"
  | "spreadsheet-stream"
  | "subtitle-stream"
  | "records-stream"
  | "xml-stream"
  | "image-browser"
  | "svg-browser"
  | "libtiff-wasm"
  | "libjxl-wasm"
  | "libjxl-encoder-wasm"
  | "libaom-avif-encoder-wasm"
  | "libavif-wasm"
  | "ffmpeg-remux"
  | "ffmpeg-audio"
  | "ffmpeg-video";

export type FormatCategory =
  | "compression"
  | "archive"
  | "subtitle"
  | "data"
  | "document"
  | "ebook"
  | "presentation"
  | "spreadsheet"
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

const legacyContainerWebmEvidence = {
  "3gp": 146_854_522,
  "mpeg-ts": 150_441_548,
  flv: 146_903_539,
} as const;

function legacyContainerWebmProfile(
  input: "3gp" | "mpeg-ts" | "flv",
  vp9: boolean,
): ConversionProfile {
  const codec = vp9 ? "VP9" : "VP8";
  return {
    id: `${input}-to-webm${vp9 ? "-vp9" : ""}`,
    input,
    output: vp9 ? "webm-vp9" : "webm",
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
      "The certified input combination is H.264 video with AAC audio; other container codec combinations require separately verified routes.",
      "Only the first non-attached video stream is converted; audio, subtitles, data, additional streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      `H.264 video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy ${codec} at 600 kbit/s${vp9 ? " in realtime mode" : ""} with no lookahead.`,
    ],
    maxTestedBytes: legacyContainerWebmEvidence[input],
    automatedTestStatus: "passed",
    public: true,
  };
}

function aviWebmProfile(vp9: boolean): ConversionProfile {
  const codec = vp9 ? "VP9" : "VP8";
  return {
    id: `avi-to-webm${vp9 ? "-vp9" : ""}`,
    input: "avi",
    output: vp9 ? "webm-vp9" : "webm",
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
      "The certified input combination is MPEG-4 Part 2 video with MP3 audio; other AVI codec combinations require separately verified routes.",
      "Only the first non-attached video stream is converted; audio, subtitles, data, additional streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      `MPEG-4 Part 2 video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy ${codec} at 600 kbit/s${vp9 ? " in realtime mode" : ""} with no lookahead.`,
    ],
    maxTestedBytes: 159_500_442,
    automatedTestStatus: "passed",
    public: true,
  };
}

function containerFlacProfile(
  input: "mkv" | "mp4" | "mov" | "3gp" | "mpeg-ts" | "flv" | "avi" | "ogv",
): ConversionProfile {
  const sourceCodec =
    input === "avi"
      ? "MP3"
      : input === "ogv"
        ? "Vorbis"
        : input === "3gp"
          ? "AAC or AMR-NB"
          : "AAC";
  const evidence = {
    mkv: 146_855_294,
    mp4: 146_854_557,
    mov: 146_854_612,
    "3gp": 156_907_373,
    "mpeg-ts": 150_441_548,
    flv: 146_903_486,
    avi: 159_500_442,
    ogv: 137_218_662,
  }[input];
  return {
    id: `${input}-to-flac`,
    input,
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
      `The certified input combination uses ${sourceCodec} audio; other audio codecs require separately verified extraction routes.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, additional audio streams, and chapters are explicitly excluded.",
      "Compatible text and language metadata are copied where FLAC can represent them; container-specific fields and artwork are excluded.",
    ],
    fidelityLimitations: [
      `FLAC losslessly preserves the decoded signed 16-bit ${sourceCodec} representation but cannot restore information already discarded by ${sourceCodec} compression.`,
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

type StandaloneAiffInput =
  | "m4a"
  | "aac"
  | "amr"
  | "mp3"
  | "flac"
  | "wav"
  | "wma"
  | "ogg"
  | "opus";

const standaloneAiffEvidence: Record<StandaloneAiffInput, number | null> = {
  m4a: 140_941_469,
  aac: 134_367_785,
  amr: 134_229_414,
  mp3: 50_401_224,
  flac: 138_185_686,
  wav: 153_600_106,
  wma: 142_503_082,
  ogg: 144_431_506,
  opus: 147_964_541,
};

function standaloneAiffProfile(input: StandaloneAiffInput): ConversionProfile {
  const sourceCodec = {
    m4a: "AAC or 16-bit ALAC",
    aac: "AAC in ADTS",
    amr: "AMR-NB",
    mp3: "MP3",
    flac: "FLAC",
    wav: "signed 16-bit little-endian PCM WAV",
    wma: "WMA2",
    ogg: "Vorbis in Ogg",
    opus: "Opus in Ogg",
  }[input];
  const losslessInput = input === "flac" || input === "wav";
  const evidence = standaloneAiffEvidence[input];
  return {
    id: `${input}-to-aiff`,
    input,
    output: "aiff",
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
      `The certified input codec is ${sourceCodec}.`,
      "Only the first audio stream is converted; chapters, artwork, attachments, additional streams, and container-specific metadata are explicitly excluded.",
      "Compatible text metadata is copied when AIFF can represent it; language tags are not guaranteed by AIFF players.",
    ],
    fidelityLimitations: losslessInput
      ? [
          "Output is signed 16-bit big-endian PCM; source samples above 16 bits are reduced to 16 bits.",
        ]
      : [
          `${sourceCodec} is decoded to signed 16-bit big-endian PCM; AIFF cannot restore information already discarded by lossy source encoding.`,
        ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

type ContainerAiffInput =
  | "mkv"
  | "mp4"
  | "mov"
  | "mpeg-ts"
  | "flv"
  | "avi"
  | "ogv"
  | "webm";

const containerAiffEvidence: Record<ContainerAiffInput, number | null> = {
  mkv: 146_855_294,
  mp4: 146_854_557,
  mov: 146_854_612,
  "mpeg-ts": 150_441_548,
  flv: 146_903_486,
  avi: 159_500_442,
  ogv: 137_218_662,
  webm: 222_941_314,
};

function containerAiffProfile(input: ContainerAiffInput): ConversionProfile {
  const sourceCodec = {
    mkv: "AAC in Matroska",
    mp4: "AAC in MP4",
    mov: "AAC in QuickTime MOV",
    "mpeg-ts": "AAC in MPEG-TS",
    flv: "AAC in FLV",
    avi: "MP3 in AVI",
    ogv: "Vorbis in Ogg Video",
    webm: "Opus in WebM",
  }[input];
  const evidence = containerAiffEvidence[input];
  return {
    id: `${input}-to-aiff`,
    input,
    output: "aiff",
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
      `The certified input combination uses ${sourceCodec}; other audio codecs require separately verified routes.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, additional audio streams, and container-specific metadata are explicitly excluded.",
      "Compatible text metadata is copied when AIFF can represent it; language tags are not guaranteed by AIFF players.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded to signed 16-bit big-endian PCM; AIFF cannot restore information already discarded by the lossy source codec.`,
      "Layouts above stereo are downmixed to stereo; the certified mono sources preserve their source sample rate and channel count.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type ContainerAmrOutputInput = Exclude<ContainerAiffInput, "webm">;

const containerAmrOutputEvidence: Record<
  ContainerAmrOutputInput,
  number | null
> = {
  mkv: 145_730_306,
  mp4: 145_729_798,
  mov: 145_729_853,
  "mpeg-ts": 149_289_672,
  flv: 145_778_223,
  avi: 159_500_442,
  ogv: null,
};

const containerAudioSourceCodec: Record<ContainerAmrOutputInput, string> = {
  mkv: "AAC in Matroska",
  mp4: "AAC in MP4",
  mov: "AAC in QuickTime MOV",
  "mpeg-ts": "AAC in MPEG-TS",
  flv: "AAC in FLV",
  avi: "MP3 in AVI",
  ogv: "Vorbis in Ogg Video",
};

function containerAmrOutputProfile(
  input: ContainerAmrOutputInput,
): ConversionProfile {
  const sourceCodec = containerAudioSourceCodec[input];
  const evidence = containerAmrOutputEvidence[input];
  return {
    id: `${input}-to-amr`,
    input,
    output: "amr",
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
      `The certified input combination uses ${sourceCodec}; other audio codecs require separately verified routes.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, additional audio streams, and container-specific metadata are explicitly excluded.",
      "Raw AMR-NB output does not preserve source metadata or artwork.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is downmixed and resampled to 8 kHz mono before lossy 12.2 kb/s AMR-NB encoding; this voice profile is not transparent for music.`,
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "failed" : "passed",
    public: evidence !== null,
  };
}

type LegacyContainerAacOutputInput = Extract<ContainerAmrOutputInput, "avi" | "ogv">;

const legacyContainerAacOutputEvidence: Record<
  LegacyContainerAacOutputInput,
  number | null
> = {
  avi: 159_500_442,
  ogv: 137_218_662,
};

function legacyContainerAacOutputProfile(
  input: LegacyContainerAacOutputInput,
): ConversionProfile {
  const sourceCodec = containerAudioSourceCodec[input];
  const evidence = legacyContainerAacOutputEvidence[input];
  return {
    id: `${input}-to-aac`,
    input,
    output: "aac",
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
      `The certified input combination uses ${sourceCodec}; other audio codecs require separately verified routes.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, additional audio streams, and container-specific metadata are explicitly excluded.",
      "Raw ADTS AAC output does not preserve source metadata or artwork.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily re-encoded as AAC-LC; this cannot restore source information.`,
      "The certified mono source retains its standard sample rate and one channel at 128 kb/s.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type ContainerLossyAudioInput = "mp4" | "mov" | "mpeg-ts" | "flv" | "avi" | "ogv";
type ContainerLossyAudioOutput = "mp3" | "opus" | "ogg";

const containerLossyAudioEvidence: Record<string, number | null> = {
  "mp4-to-opus": 145_729_798,
  "mov-to-opus": 145_729_853,
  "mpeg-ts-to-opus": 149_289_672,
  "flv-to-opus": 145_778_223,
  "avi-to-opus": 159_500_442,
  "ogv-to-opus": 137_218_662,
  "mp4-to-ogg": 145_729_798,
  "mov-to-ogg": 145_729_853,
  "mpeg-ts-to-ogg": 149_289_672,
  "flv-to-ogg": 145_778_223,
  "avi-to-ogg": 159_500_442,
  "ogv-to-mp3": 137_218_662,
};

function containerLossyAudioProfile(
  input: ContainerLossyAudioInput,
  output: ContainerLossyAudioOutput,
): ConversionProfile {
  const id = `${input}-to-${output}`;
  const sourceCodec = containerAudioSourceCodec[input];
  const outputDescription = {
    mp3: "128 kb/s mono MP3",
    opus: "64 kb/s VBR mono Opus in Ogg",
    ogg: "quality-4 mono Vorbis in Ogg",
  }[output];
  const evidence = containerLossyAudioEvidence[id];
  return {
    id,
    input,
    output,
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
      `The certified input combination uses ${sourceCodec}; other audio codecs require separately verified routes.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, additional audio streams, and container-specific metadata are explicitly excluded.",
      output === "mp3"
        ? "Compatible text tags are mapped to ID3 where possible; stream language and container-only fields may not be retained."
        : "Compatible text tags are copied into Ogg comments where possible; stream language and container-only fields may not be retained.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily re-encoded as ${outputDescription}; this cannot restore source information.`,
      output === "mp3"
        ? "The certified mono source is normalized to a LAME-supported rate through 48 kHz."
        : output === "opus"
          ? "The measured fastest libopus complexity setting preserves supported source rates through 48 kHz and signals the standard 48 kHz Opus clock."
          : "Reference libvorbis quality 4 preserves source rates through 48 kHz.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

const containerM4aSourceCodec = {
  avi: "MP3 in AVI",
  ogv: "Vorbis in Ogg Video",
  webm: "Opus in WebM",
} as const;

const containerM4aEvidence: Record<keyof typeof containerM4aSourceCodec, number> = {
  avi: 159_500_442,
  ogv: 137_218_662,
  webm: 222_941_314,
};

function containerM4aProfile(
  input: keyof typeof containerM4aSourceCodec,
): ConversionProfile {
  const evidence = containerM4aEvidence[input];
  const sourceCodec = containerM4aSourceCodec[input];
  return {
    id: `${input}-to-m4a`,
    input,
    output: "m4a",
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
      `The certified input combination uses ${sourceCodec}; other audio codecs require separately verified routes.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, additional audio streams, and container-specific metadata are explicitly excluded.",
      "Compatible text tags are copied where M4A can represent them; source stream language and container-only fields may not be retained.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily re-encoded as AAC-LC in fragmented M4A; this cannot restore source information.`,
      "The fastest certified AAC coder settings preserve standard source rates through 48 kHz and encode at 128 kb/s mono or 192 kb/s stereo.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: "passed",
    public: true,
  };
}

const threeGpAmrExtractionProfile: ConversionProfile = {
  id: "3gp-to-amr",
  input: "3gp",
  output: "amr",
  engine: "ffmpeg-remux",
  route: "stream-copy",
  browserRequirements: [
    "WebAssembly",
    "SharedArrayBuffer",
    "cross-origin isolation",
    "File System Access",
  ],
  cpuClass: "low",
  memoryClass: "bounded-low",
  metadataLimitations: [
    "The certified input combination uses AMR-NB audio in 3GP; AAC and other audio codecs require separately verified routes.",
    "Only the first AMR-NB audio stream is copied; video, subtitles, attachments, data, chapters, artwork, additional audio streams, and container metadata are explicitly excluded.",
    "Raw AMR-NB output cannot represent 3GP metadata or language tags.",
  ],
  fidelityLimitations: [
    "Compressed 8 kHz mono AMR-NB packets are copied without decoding or re-encoding, so their encoded audio content is unchanged.",
  ],
  maxTestedBytes: 156_907_373,
  automatedTestStatus: "passed",
  public: true,
};

type WebmAudioOutput = "wav" | "flac" | "amr" | "mp3" | "aac";

const webmAudioOutputEvidence: Record<WebmAudioOutput, number | null> = {
  wav: 222_941_314,
  flac: 222_941_314,
  amr: 222_941_314,
  mp3: 222_941_314,
  aac: 222_941_314,
};

function webmAudioOutputProfile(output: WebmAudioOutput): ConversionProfile {
  const outputDescription = {
    wav: "signed 16-bit little-endian PCM WAV",
    flac: "lossless 16-bit FLAC",
    amr: "12.2 kb/s AMR-NB voice audio",
    mp3: "128 kb/s mono MP3",
    aac: "128 kb/s mono AAC-LC in ADTS",
  }[output];
  const evidence = webmAudioOutputEvidence[output];
  return {
    id: `webm-to-${output}`,
    input: "webm",
    output,
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
      "The certified input is AV1 video with one 48 kHz mono Opus audio stream in WebM; other WebM audio codecs require separate evidence.",
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, additional streams, and container-specific metadata are explicitly excluded.",
      output === "flac"
        ? "Compatible text and language metadata are copied where FLAC can represent them; embedded artwork is excluded."
        : output === "mp3"
          ? "Compatible text tags are mapped to ID3 where possible; WebM-only fields and artwork are excluded."
          : output === "wav"
            ? "WebM metadata and artwork are excluded because this bounded PCM WAV profile does not preserve them."
            : "Raw AMR-NB and ADTS outputs do not preserve WebM metadata or artwork.",
    ],
    fidelityLimitations: [
      output === "wav" || output === "flac"
        ? `Opus is decoded to ${outputDescription}; this preserves the decoded 16-bit representation but cannot restore information already discarded by Opus.`
        : output === "amr"
          ? "Opus is downmixed and resampled to 8 kHz mono before lossy AMR-NB encoding; this voice profile is not transparent for music."
          : `Opus is decoded and lossily re-encoded as ${outputDescription}; this cannot restore source information.`,
      output === "wav" || output === "flac"
        ? "The certified mono source retains its 48 kHz sample rate and channel count."
        : output === "amr"
          ? "Output is fixed to one 8 kHz mono channel."
          : "The certified mono source retains its 48 kHz rate and one channel.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type StandaloneAmrOutputInput = Exclude<StandaloneAiffInput, "amr"> | "aiff";

const standaloneAmrOutputEvidence: Record<
  StandaloneAmrOutputInput,
  number | null
> = {
  m4a: 140_941_469,
  aac: 134_367_785,
  mp3: 50_401_224,
  flac: 138_185_686,
  wav: 153_600_106,
  wma: 142_503_082,
  aiff: 201_600_102,
  ogg: 144_431_506,
  opus: 147_964_541,
};

function standaloneAmrOutputProfile(
  input: StandaloneAmrOutputInput,
): ConversionProfile {
  const sourceCodec = {
    m4a: "AAC or 16-bit ALAC",
    aac: "AAC in ADTS",
    mp3: "MP3",
    flac: "FLAC",
    wav: "signed 16-bit little-endian PCM WAV",
    wma: "WMA2",
    aiff: "signed 16-bit big-endian PCM AIFF",
    ogg: "Vorbis in Ogg",
    opus: "Opus in Ogg",
  }[input];
  const evidence = standaloneAmrOutputEvidence[input];
  return {
    id: `${input}-to-amr`,
    input,
    output: "amr",
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
      `The certified input codec is ${sourceCodec}.`,
      "Only the first audio stream is converted; chapters, artwork, attachments, additional streams, and source metadata are explicitly excluded.",
      "AMR-NB output is fixed to one 8 kHz mono voice channel at 12.2 kb/s.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is downmixed and resampled to 8 kHz mono before lossy AMR-NB encoding; this voice profile is not transparent for music.`,
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type StandaloneMp3OutputInput = Exclude<StandaloneAiffInput, "mp3"> | "aiff";

const standaloneMp3OutputEvidence: Record<
  StandaloneMp3OutputInput,
  number | null
> = {
  m4a: 140_941_469,
  aac: 134_367_785,
  amr: 134_229_414,
  flac: 138_185_686,
  wav: 153_600_106,
  wma: 142_503_082,
  aiff: 201_600_102,
  ogg: 144_431_506,
  opus: 147_964_541,
};

function standaloneMp3OutputProfile(
  input: StandaloneMp3OutputInput,
): ConversionProfile {
  const sourceCodec = {
    m4a: "AAC or 16-bit ALAC",
    aac: "AAC in ADTS",
    amr: "8 kHz mono AMR-NB",
    flac: "FLAC",
    wav: "signed 16-bit little-endian PCM WAV",
    wma: "WMA2",
    aiff: "signed 16-bit big-endian PCM AIFF",
    ogg: "Vorbis in Ogg",
    opus: "Opus in Ogg",
  }[input];
  const evidence = standaloneMp3OutputEvidence[input];
  return {
    id: `${input}-to-mp3`,
    input,
    output: "mp3",
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
      `The certified input codec is ${sourceCodec}.`,
      "Only the first audio stream is converted; chapters, artwork, attachments, and additional streams are explicitly excluded.",
      "Compatible text tags are mapped to ID3 where possible; stream language and container-specific fields may not be retained.",
      "Mono output is fixed at 128 kb/s and one channel; stereo output is fixed at 192 kb/s and at most two channels.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily encoded as MP3; the output is normalized to a LAME-supported 32, 44.1, or 48 kHz rate for a broadly compatible bitrate profile.`,
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

type StandaloneAacOutputInput = Exclude<StandaloneAiffInput, "aac"> | "aiff";

const standaloneAacOutputEvidence: Record<
  StandaloneAacOutputInput,
  number | null
> = {
  m4a: 140_941_469,
  amr: 134_229_414,
  mp3: 50_401_224,
  flac: 138_185_686,
  wav: 153_600_106,
  wma: 142_503_082,
  aiff: 201_600_102,
  ogg: 144_431_506,
  opus: 147_964_541,
};

function standaloneAacOutputProfile(
  input: StandaloneAacOutputInput,
): ConversionProfile {
  const sourceCodec = {
    m4a: "AAC or 16-bit ALAC",
    amr: "8 kHz mono AMR-NB",
    mp3: "MP3",
    flac: "FLAC",
    wav: "signed 16-bit little-endian PCM WAV",
    wma: "WMA2",
    aiff: "signed 16-bit big-endian PCM AIFF",
    ogg: "Vorbis in Ogg",
    opus: "Opus in Ogg",
  }[input];
  const evidence = standaloneAacOutputEvidence[input];
  return {
    id: `${input}-to-aac`,
    input,
    output: "aac",
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
      `The certified input codec is ${sourceCodec}.`,
      "Only the first audio stream is converted; chapters, artwork, attachments, additional streams, and all source tags are explicitly excluded because raw ADTS cannot represent them.",
      "Mono output is fixed at 128 kb/s and one channel; stereo output is fixed at 192 kb/s and at most two channels.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily encoded as AAC-LC with FFmpeg's measured fast-search coder; standard source rates from 8 through 48 kHz are preserved, while nonstandard or higher rates are rounded up or capped to the nearest supported rate through 48 kHz.`,
      "The fastest certified profile disables TNS, PNS, intensity-stereo, and M/S-stereo tools after comparative ASDR testing found no quality regression on the reference program and WMA fixtures.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type StandaloneOpusOutputInput =
  | Exclude<StandaloneAiffInput, "opus">
  | "aiff";

const standaloneOpusOutputEvidence: Record<
  StandaloneOpusOutputInput,
  number | null
> = {
  m4a: 140_941_469,
  aac: 134_367_785,
  amr: 134_229_414,
  mp3: 50_401_224,
  flac: 138_185_686,
  wav: 153_600_106,
  wma: 142_503_082,
  aiff: 201_600_102,
  ogg: 144_431_506,
};

function standaloneOpusOutputProfile(
  input: StandaloneOpusOutputInput,
): ConversionProfile {
  const sourceCodec = {
    m4a: "AAC or 16-bit ALAC",
    aac: "AAC in ADTS",
    amr: "8 kHz mono AMR-NB",
    mp3: "MP3",
    flac: "FLAC",
    wav: "signed 16-bit little-endian PCM WAV",
    wma: "WMA2",
    aiff: "signed 16-bit big-endian PCM AIFF",
    ogg: "Vorbis in Ogg",
  }[input];
  const evidence = standaloneOpusOutputEvidence[input];
  return {
    id: `${input}-to-opus`,
    input,
    output: "opus",
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
      `The certified input codec is ${sourceCodec}.`,
      "Only the first audio stream is converted; chapters, artwork, attachments, and additional streams are explicitly excluded.",
      "Compatible text tags are copied into Ogg comments where possible; stream language and container-specific fields may not be retained.",
      "Mono output targets 64 kb/s VBR and one channel; stereo output targets 128 kb/s VBR and at most two channels.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily encoded as Opus with the measured fastest libopus complexity setting; supported 8, 12, 16, 24, and 48 kHz source rates are preserved, while unsupported or higher rates are rounded up or capped through 48 kHz.`,
      "Complexity 0 was retained only after comparative ASDR testing found no quality regression against complexity 5 or 10 on the protected reference source.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type StandaloneVorbisOutputInput =
  | Exclude<StandaloneAiffInput, "ogg">
  | "aiff"
  | "amr-wb";

const standaloneVorbisOutputEvidence: Record<
  StandaloneVorbisOutputInput,
  number | null
> = {
  m4a: 140_941_469,
  aac: 134_367_785,
  amr: 134_229_414,
  "amr-wb": 137_420_809,
  mp3: 50_401_224,
  flac: 138_185_686,
  wav: 153_600_106,
  wma: 142_503_082,
  aiff: 201_600_102,
  opus: 147_964_541,
};

function standaloneVorbisOutputProfile(
  input: StandaloneVorbisOutputInput,
): ConversionProfile {
  const sourceCodec = {
    m4a: "AAC or 16-bit ALAC",
    aac: "AAC in ADTS",
    amr: "8 kHz mono AMR-NB",
    "amr-wb": "16 kHz mono AMR-WB in 3GP/ISOBMFF .awb",
    mp3: "MP3",
    flac: "FLAC",
    wav: "signed 16-bit little-endian PCM WAV",
    wma: "WMA2",
    aiff: "signed 16-bit big-endian PCM AIFF",
    opus: "Opus in Ogg",
  }[input];
  const evidence = standaloneVorbisOutputEvidence[input];
  return {
    id: `${input}-to-ogg`,
    input,
    output: "ogg",
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
      `The certified input codec is ${sourceCodec}.`,
      "Only the first audio stream is converted; chapters, artwork, attachments, and additional streams are explicitly excluded.",
      "Compatible text tags are copied into Vorbis comments where possible; stream language and container-specific fields may not be retained.",
      "Output uses the measured quality-4 reference libvorbis VBR profile and at most two channels.",
    ],
    fidelityLimitations: [
      `${sourceCodec} is decoded and lossily encoded as Vorbis; source sample rates through 48 kHz are preserved and higher rates are capped at 48 kHz.`,
      "Reference libvorbis quality 4 was retained after comparative speed, output-size, and ASDR testing rejected FFmpeg's slower experimental native encoder and the lower-fidelity quality-3 setting.",
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

type ThreeGpAmrOutput = "aiff" | "mp3" | "opus" | "ogg";

function threeGpAmrOutputProfile(output: ThreeGpAmrOutput): ConversionProfile {
  const outputDescription = {
    aiff: "signed 16-bit big-endian PCM AIFF",
    mp3: "128 kb/s mono MP3",
    opus: "64 kb/s mono Opus in Ogg",
    ogg: "quality-4 mono Vorbis in Ogg",
  }[output];
  const rateDescription = {
    aiff: "the source sample rate (8 kHz for AMR-NB or 48 kHz for the certified AAC-LC variant)",
    mp3: "32 kHz for LAME compatibility",
    opus: "the source 8 kHz rate internally; Ogg signals the standard 48 kHz Opus clock",
    ogg: "the source 8 kHz sample rate",
  }[output];
  return {
    id: `3gp-to-${output}`,
    input: "3gp",
    output,
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
      output === "aiff"
        ? "The certified input variants are a 3GP container whose first audio stream is either 8 kHz mono AMR-NB or 48 kHz mono AAC-LC; other codecs require separate evidence."
        : "The certified input is a 3GP container whose first audio stream is 8 kHz mono AMR-NB; AAC-in-3GP retains its separately tested routes.",
      "The 128 MiB-class bounded profile uses a genuine 720-second H.264/AMR-NB 3GP and traverses the large interleaved video payload; pathological multi-hour files with millions of audio packets and packet-count-sized indexes remain excluded.",
      "Only the first audio stream is converted; video, subtitles, data, chapters, artwork, and additional streams are explicitly excluded.",
      `Output is ${outputDescription}; compatible text tags are copied only where the destination can represent them.`,
    ],
    fidelityLimitations: [
      output === "aiff"
        ? "AMR-NB or AAC-LC is decoded to signed 16-bit PCM; AIFF cannot restore information already discarded by the source codec."
        : `AMR-NB is decoded and lossily encoded as ${outputDescription}; this cannot restore source information.`,
      `The bounded encoder uses ${rateDescription} and one channel without unnecessary high-rate upsampling.`,
    ],
    maxTestedBytes: 156_907_373,
    automatedTestStatus: "passed",
    public: true,
  };
}

type StandaloneWmaInput = "m4a" | "aac" | "amr-wb" | "mp3" | "aiff" | "ogg" | "opus";

function standaloneWmaOutputProfile(input: StandaloneWmaInput): ConversionProfile {
  const evidence: Record<StandaloneWmaInput, number | null> = {
    m4a: 140_941_469,
    aac: 134_367_785,
    "amr-wb": 137_420_809,
    mp3: 136_002_312,
    aiff: 201_600_102,
    ogg: 144_431_506,
    opus: 147_964_541,
  };
  const inputDescription = {
    m4a: "AAC or ALAC in M4A",
    aac: "raw AAC-LC ADTS",
    "amr-wb": "mono 16 kHz AMR-WB in 3GP/ISOBMFF .awb",
    mp3: "MP3",
    aiff: "signed 16-bit PCM AIFF",
    ogg: "Ogg Vorbis",
    opus: "Ogg Opus",
  }[input];
  return {
    id: `${input}-to-wma`,
    input,
    output: "wma",
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
      `The certified input is ${inputDescription}; other codec variants require separate evidence.`,
      "Only the first audio stream is converted; artwork, chapters, and container-only metadata are excluded.",
      "Compatible text tags are copied into ASF where representable.",
    ],
    fidelityLimitations: [
      input === "amr-wb"
        ? "AMR-WB is resampled to 32 kHz and encoded as mono WMA2 at 64 kbit/s using the fastest quality-valid measured speech policy."
        : "Audio is resampled to 48 kHz when needed and encoded as lossy WMA2 at 320 kbit/s; layouts above stereo are downmixed to stereo.",
      input === "aiff"
        ? "Lossless PCM input becomes lossy WMA2."
        : `WMA2 adds another lossy generation to ${inputDescription}${input === "m4a" ? " when its codec is AAC; ALAC input becomes lossy" : ""}.`,
    ],
    maxTestedBytes: evidence[input],
    automatedTestStatus: evidence[input] === null ? "pending" : "passed",
    public: evidence[input] !== null,
  };
}

type ContainerWmaInput =
  | "mkv"
  | "mp4"
  | "mov"
  | "3gp"
  | "mpeg-ts"
  | "flv"
  | "avi"
  | "ogv"
  | "webm";

const containerWmaEvidence: Record<ContainerWmaInput, number | null> = {
  mkv: 146_855_294,
  mp4: 146_854_557,
  mov: 146_854_612,
  "3gp": 146_854_456,
  "mpeg-ts": 150_441_548,
  flv: 146_903_486,
  avi: 159_500_442,
  ogv: 137_218_662,
  webm: 222_941_314,
};

function containerWmaOutputProfile(input: ContainerWmaInput): ConversionProfile {
  const inputDescription = {
    mkv: "AAC in Matroska",
    mp4: "AAC in MP4",
    mov: "AAC in QuickTime MOV",
    "3gp": "AAC in 3GP",
    "mpeg-ts": "AAC in MPEG-TS",
    flv: "AAC in FLV",
    avi: "MP3 in AVI",
    ogv: "Vorbis in Ogg Video",
    webm: "Opus in WebM",
  }[input];
  const evidence = containerWmaEvidence[input];
  return {
    id: `${input}-to-wma`,
    input,
    output: "wma",
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
      `The certified input is ${inputDescription}; other codec variants require separate evidence.`,
      "Only the first audio stream is converted; video, subtitles, attachments, data, chapters, artwork, and additional streams are explicitly excluded.",
      "Compatible text and language tags are copied into ASF where representable; container-specific metadata is excluded.",
    ],
    fidelityLimitations: [
      "Audio is resampled to 48 kHz when needed and encoded as lossy WMA2 at 320 kbit/s; layouts above stereo are downmixed to stereo.",
      `WMA2 adds another lossy generation to ${inputDescription}.`,
    ],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: evidence !== null,
  };
}

const h264ElementaryEvidence = {
  "h264-to-mp4": 145_801_019,
  "h264-to-webm": 145_801_019,
  "h264-to-webm-vp9": 145_801_019,
  "mkv-to-h264": 146_855_294,
  "mp4-to-h264": 146_854_557,
  "mov-to-h264": 146_854_612,
  "3gp-to-h264": 146_854_456,
  "mpeg-ts-to-h264": 150_441_548,
  "flv-to-h264": 146_903_486,
} as const satisfies Record<string, number | null>;

function h264InputProfile(
  output: "mp4" | "webm" | "webm-vp9",
): ConversionProfile {
  const id = `h264-to-${output}` as keyof typeof h264ElementaryEvidence;
  const evidence = h264ElementaryEvidence[id];
  const webm = output !== "mp4";
  const codec = output === "webm-vp9" ? "VP9" : "VP8";
  return {
    id,
    input: "h264",
    output,
    engine: webm ? "ffmpeg-video" : "ffmpeg-remux",
    route: webm ? "re-encode" : "stream-copy",
    browserRequirements: [
      "WebAssembly",
      "SharedArrayBuffer",
      "cross-origin isolation",
      "File System Access",
    ],
    cpuClass: webm ? "high" : "low",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "The input is a single Annex B H.264 elementary video stream with no audio, subtitles, chapters, attachments, or general container metadata.",
      "Frame timestamps are synthesized from the detected source frame rate.",
      webm
        ? "Compatible aspect-ratio and color descriptors are copied where WebM can represent them."
        : "Compatible video descriptors are copied into fragmented MP4.",
    ],
    fidelityLimitations: webm
      ? [
          `H.264 video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy ${codec} at 600 kbit/s${output === "webm-vp9" ? " in realtime mode" : ""} with no lookahead.`,
        ]
      : [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

function containerH264Profile(
  input: "mkv" | "mp4" | "mov" | "3gp" | "mpeg-ts" | "flv",
): ConversionProfile {
  const id = `${input}-to-h264` as keyof typeof h264ElementaryEvidence;
  const evidence = h264ElementaryEvidence[id];
  return {
    id,
    input,
    output: "h264",
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
      "The certified input combination uses H.264 video; other video codecs require a separately verified conversion route.",
      "Only the first non-attached H.264 video stream is extracted; audio, subtitles, attachments, data, additional video streams, and chapters are explicitly excluded.",
      "An H.264 elementary stream cannot preserve container packet timestamps, general metadata, language tags, rotation metadata, or chapter timing; playback timing is reconstructed from the detected elementary frame rate.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const hevcElementaryEvidence = {
  "mkv-to-hevc": 148_952_609,
  "mp4-to-hevc": 149_251_863,
  "mov-to-hevc": 149_251_969,
  "mpeg-ts-to-hevc": 157_710_004,
} as const satisfies Record<string, number | null>;

function containerHevcProfile(
  input: "mkv" | "mp4" | "mov" | "mpeg-ts",
): ConversionProfile {
  const id = `${input}-to-hevc` as keyof typeof hevcElementaryEvidence;
  const evidence = hevcElementaryEvidence[id];
  return {
    id,
    input,
    output: "hevc",
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
      "The certified input combination uses HEVC video; other video codecs require a separately verified conversion route.",
      "Only the first non-attached HEVC video stream is extracted; audio, subtitles, attachments, data, additional video streams, and chapters are explicitly excluded.",
      "An HEVC elementary stream cannot preserve container packet timestamps, general metadata, language tags, rotation metadata, or chapter timing; playback timing is reconstructed from the detected elementary frame rate.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const matroskaCopyEvidence = {
  "mp4-to-mkv": 147_136_623,
  "mov-to-mkv": 147_136_647,
  "3gp-to-mkv": 146_854_522,
  "mpeg-ts-to-mkv": 150_441_548,
  "flv-to-mkv": 146_903_539,
  "avi-to-mkv": 159_500_442,
  "webm-to-mkv": 222_941_314,
  "ogv-to-mkv": 137_218_662,
} as const satisfies Record<string, number | null>;

function containerMatroskaProfile(
  input: "mp4" | "mov" | "3gp" | "mpeg-ts" | "flv" | "avi" | "webm" | "ogv",
): ConversionProfile {
  const id = `${input}-to-mkv` as keyof typeof matroskaCopyEvidence;
  const evidence = matroskaCopyEvidence[id];
  return {
    id,
    input,
    output: "mkv",
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
      "The certified codec combinations are H.264/AAC in MP4, MOV, 3GP, MPEG-TS, and FLV; MPEG-4 Part 2/MP3 in AVI; AV1/Opus in WebM; and Theora/Vorbis in OGV.",
      "Compatible video, audio, subtitle, attachment, chapter, stream, and general metadata are copied without re-encoding; unsupported stream codecs and attached-picture tracks are rejected or explicitly disclosed.",
      input === "avi"
        ? "AVI uses five-second/5 MiB Matroska clusters plus a compact cue index because FFmpeg live mode writes invalid VFW duration metadata; the measured indexed route preserves accurate duration and seeking within the certified memory ceiling."
        : "The bounded live-Matroska layout omits a duration field and cue index so muxer memory cannot grow with file duration; sequential playback remains valid, while accurate seeking or displayed duration may require a player scan.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const containerMpegTsEvidence = {
  "mkv-to-mpeg-ts": 147_131_071,
  "mp4-to-mpeg-ts": 147_136_623,
  "mov-to-mpeg-ts": 147_136_646,
  "3gp-to-mpeg-ts": 146_854_522,
  "flv-to-mpeg-ts": 146_903_539,
} as const satisfies Record<string, number | null>;

function containerMpegTsProfile(
  input: "mkv" | "mp4" | "mov" | "3gp" | "flv",
): ConversionProfile {
  const id = `${input}-to-mpeg-ts` as keyof typeof containerMpegTsEvidence;
  const evidence = containerMpegTsEvidence[id];
  return {
    id,
    input,
    output: "mpeg-ts",
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
      "The certified inputs contain H.264 or HEVC video with AAC audio; other codecs require a separately verified route.",
      "All compatible video and audio streams are copied without re-encoding; subtitles, attachments, attached pictures, chapters, language tags, and general container metadata are explicitly excluded because this MPEG-TS profile cannot preserve them reliably.",
      "MPEG-TS begins on a standards-compliant transport timestamp offset and cannot preserve MP4/MOV AAC priming metadata, so decoded audio trim may differ even though compressed AAC access units are unchanged.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const containerThreeGpEvidence = {
  "mkv-to-3gp": 147_131_069,
  "mp4-to-3gp": 147_136_621,
  "mov-to-3gp": 147_136_645,
  "mpeg-ts-to-3gp": 150_441_548,
  "flv-to-3gp": 146_903_539,
} as const satisfies Record<string, number | null>;

function containerThreeGpProfile(
  input: "mkv" | "mp4" | "mov" | "mpeg-ts" | "flv",
): ConversionProfile {
  const id = `${input}-to-3gp` as keyof typeof containerThreeGpEvidence;
  const evidence = containerThreeGpEvidence[id];
  return {
    id,
    input,
    output: "3gp",
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
      "The certified inputs contain H.264 video with AAC audio; other codecs require a separately verified route.",
      "All compatible video and audio streams are copied without re-encoding and compatible stream language tags are preserved; subtitles, attachments, attached pictures, chapters, and unsupported container metadata are explicitly excluded.",
      "The bounded fragmented-3GP layout avoids duration-sized muxer indexes. Some older players may need to scan fragments before displaying an accurate duration or seeking.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const containerMovEvidence = {
  "mkv-to-mov": 147_131_073,
  "mp4-to-mov": 147_136_624,
  "3gp-to-mov": 146_854_522,
  "mpeg-ts-to-mov": 150_441_548,
  "flv-to-mov": 146_903_539,
} as const satisfies Record<string, number | null>;

function containerMovProfile(
  input: "mkv" | "mp4" | "3gp" | "mpeg-ts" | "flv",
): ConversionProfile {
  const id = `${input}-to-mov` as keyof typeof containerMovEvidence;
  const evidence = containerMovEvidence[id];
  return {
    id,
    input,
    output: "mov",
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
      "The certified inputs contain H.264 or HEVC video with AAC audio; other codecs require a separately verified route.",
      "All compatible video and audio streams are copied without re-encoding and compatible stream language and general tags are preserved; subtitles, attachments, attached pictures, chapters, and unsupported metadata are explicitly excluded.",
      "The bounded fragmented-QuickTime layout avoids duration-sized muxer indexes. Some players may need to scan fragments before displaying an accurate duration or seeking.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const containerFlvEvidence = {
  "mkv-to-flv": 147_131_070,
  "mp4-to-flv": 147_136_622,
  "mov-to-flv": 147_136_646,
  "3gp-to-flv": 146_854_522,
  "mpeg-ts-to-flv": 150_441_548,
} as const satisfies Record<string, number | null>;

function containerFlvProfile(
  input: "mkv" | "mp4" | "mov" | "3gp" | "mpeg-ts",
): ConversionProfile {
  const id = `${input}-to-flv` as keyof typeof containerFlvEvidence;
  const evidence = containerFlvEvidence[id];
  return {
    id,
    input,
    output: "flv",
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
      "The certified inputs contain H.264 video with AAC audio; other codecs require a separately verified route.",
      "FLV carries only the first H.264 video stream and first AAC audio stream without re-encoding; additional streams, subtitles, attachments, attached pictures, chapters, language tags, and unsupported general metadata are explicitly excluded.",
      "The FLV trailer seeks back only to update fixed-size duration and file-size metadata; output memory remains bounded independently of total duration and file size.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const mpeg2ElementaryEvidence = {
  "m2v-to-mpeg-ts": 136_166_136,
  "mkv-to-m2v": 136_294_704,
  "mp4-to-m2v": 136_284_917,
  "mov-to-m2v": 136_284_843,
  "avi-to-m2v": 136_465_056,
  "mpeg-ts-to-m2v": 142_273_136,
} as const satisfies Record<string, number | null>;

function mpeg2TransportProfile(): ConversionProfile {
  const evidence = mpeg2ElementaryEvidence["m2v-to-mpeg-ts"];
  return {
    id: "m2v-to-mpeg-ts",
    input: "m2v",
    output: "mpeg-ts",
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
      "The input is a single MPEG-2 elementary video stream with no audio, subtitles, chapters, attachments, or general container metadata.",
      "Frame timestamps are synthesized from the detected elementary-stream frame rate before MPEG-TS muxing.",
      "The output is a video-only transport stream; adding or converting audio requires a separately verified profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

function containerMpeg2Profile(
  input: "mkv" | "mp4" | "mov" | "avi" | "mpeg-ts",
): ConversionProfile {
  const id = `${input}-to-m2v` as keyof typeof mpeg2ElementaryEvidence;
  const evidence = mpeg2ElementaryEvidence[id];
  return {
    id,
    input,
    output: "m2v",
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
      "The certified input combination uses MPEG-2 video; other video codecs require a separately verified conversion route.",
      "Only the first non-attached MPEG-2 video stream is extracted; audio, subtitles, attachments, data, additional video streams, and chapters are explicitly excluded.",
      "An MPEG-2 elementary stream cannot preserve container packet timestamps, general metadata, language tags, rotation metadata, or chapter timing; playback timing is reconstructed from the detected elementary frame rate.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const m4vElementaryEvidence = {
  "m4v-to-mp4": 179_609_473,
  "mkv-to-m4v": 180_576_319,
  "mp4-to-m4v": 179_625_218,
  "mov-to-m4v": 179_625_169,
  "avi-to-m4v": 179_650_578,
} as const satisfies Record<string, number | null>;

function m4vMp4Profile(): ConversionProfile {
  const evidence = m4vElementaryEvidence["m4v-to-mp4"];
  return {
    id: "m4v-to-mp4",
    input: "m4v",
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
      "The input is a single MPEG-4 Part 2 elementary video stream with no audio, subtitles, chapters, attachments, or general container metadata.",
      "Frame timestamps are reconstructed from the elementary stream before fragmented MP4 muxing.",
      "The output is video-only; adding or converting audio requires a separately verified profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

function containerM4vProfile(
  input: "mkv" | "mp4" | "mov" | "avi",
): ConversionProfile {
  const id = `${input}-to-m4v` as keyof typeof m4vElementaryEvidence;
  const evidence = m4vElementaryEvidence[id];
  return {
    id,
    input,
    output: "m4v",
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
      "The certified input combination uses MPEG-4 Part 2 video; other video codecs require a separately verified conversion route.",
      "Only the first non-attached MPEG-4 Part 2 video stream is extracted; audio, subtitles, attachments, data, additional video streams, and chapters are explicitly excluded.",
      "An M4V elementary stream cannot preserve container packet timestamps, general metadata, language tags, rotation metadata, or chapter timing; playback timing is reconstructed from the encoded video headers.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const av1WebmEvidence = {
  "mkv-to-webm-av1": 222_942_211,
} as const satisfies Record<string, number | null>;

function av1WebmProfile(): ConversionProfile {
  const evidence = av1WebmEvidence["mkv-to-webm-av1"];
  return {
    id: "mkv-to-webm-av1",
    input: "mkv",
    output: "webm-av1",
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
      "The first non-attached video stream must be AV1. All AV1 video streams and compatible Opus or Vorbis audio streams are copied without re-encoding.",
      "Incompatible video or audio, subtitles, attachments, data streams, and chapters are explicitly excluded with warnings.",
      "Compatible stream dispositions, language tags, codec descriptors, and general metadata are copied where WebM can represent them.",
      "The bounded live-WebM layout omits a duration field and cue index so muxer memory cannot grow with file duration; players can still decode sequentially but may need to scan before seeking accurately.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const mp3ExtractionEvidence = {
  mkv: 181_340_062,
  mp4: 181_344_111,
  mov: 181_344_078,
  avi: 182_803_272,
  "mpeg-ts": 185_645_300,
  flv: 181_377_794,
} as const satisfies Record<string, number | null>;

function containerMp3Profile(
  input: keyof typeof mp3ExtractionEvidence,
): ConversionProfile {
  const evidence = mp3ExtractionEvidence[input];
  return {
    id: `${input}-to-mp3`,
    input,
    output: "mp3",
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
      "The first compatible MP3 audio stream is copied without decoding or re-encoding; a source without MP3 audio is rejected rather than transcoded implicitly.",
      "Video, subtitles, attachments, data, chapters, and additional or incompatible audio streams are explicitly excluded with warnings.",
      "Compatible text metadata is mapped to ID3 where the MP3 muxer can represent it; container timing, stream language, artwork, and container-specific fields may not be retained.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const aacExtractionEvidence = {
  mkv: 146_855_294,
  mp4: 146_854_557,
  mov: 146_854_612,
  "3gp": 146_854_456,
  "mpeg-ts": 150_441_548,
  flv: 146_903_486,
} as const satisfies Record<string, number | null>;

function containerAacProfile(
  input: keyof typeof aacExtractionEvidence,
): ConversionProfile {
  const evidence = aacExtractionEvidence[input];
  return {
    id: `${input}-to-aac`,
    input,
    output: "aac",
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
      "The first compatible AAC audio stream is copied without decoding or re-encoding; a source without AAC audio is rejected rather than transcoded implicitly.",
      "Video, subtitles, attachments, data, chapters, and additional or incompatible audio streams are explicitly excluded with warnings.",
      "Compatible general text metadata is written as ID3v2 where raw ADTS AAC can represent it; container timing, stream language, artwork, dispositions, and container-specific fields are not retained.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
}

const oggAudioExtractionEvidence = {
  "mkv-to-ogg": 222_125_242,
  "webm-to-ogg": 222_124_822,
  "ogv-to-ogg": 137_218_662,
  "mkv-to-opus": 222_942_211,
  "webm-to-opus": 222_941_314,
} as const satisfies Record<string, number | null>;

function containerOggAudioProfile(
  input: "mkv" | "webm" | "ogv",
  output: "ogg" | "opus",
): ConversionProfile {
  const id = `${input}-to-${output}` as keyof typeof oggAudioExtractionEvidence;
  const evidence = oggAudioExtractionEvidence[id];
  const codec = output === "ogg" ? "Vorbis" : "Opus";
  return {
    id,
    input,
    output,
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
      `The first compatible ${codec} audio stream is copied into Ogg without decoding or re-encoding; a source without ${codec} audio is rejected rather than transcoded implicitly.`,
      "Video, subtitles, attachments, data, chapters, and additional or incompatible audio streams are explicitly excluded with warnings.",
      "Compatible Ogg comments and language metadata are retained where representable; container timing, artwork, dispositions, and container-specific fields are not retained.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: evidence,
    automatedTestStatus: evidence === null ? "pending" : "passed",
    public: true,
  };
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
    id: "bzip2",
    label: "BZIP2",
    extensions: ["bz2", "bzip2"],
    mimeTypes: ["application/x-bzip2"],
    category: "compression",
  },
  {
    id: "xz",
    label: "XZ",
    extensions: ["xz"],
    mimeTypes: ["application/x-xz"],
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
    id: "tar-bz2",
    label: "Compressed TAR (TAR.BZ2)",
    extensions: ["tar.bz2", "tbz2", "tbz"],
    mimeTypes: ["application/x-bzip2"],
    category: "archive",
  },
  {
    id: "tar-xz",
    label: "Compressed TAR (TAR.XZ)",
    extensions: ["tar.xz", "txz"],
    mimeTypes: ["application/x-xz"],
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
    id: "sevenzip",
    label: "7Z archive",
    extensions: ["7z"],
    mimeTypes: ["application/x-7z-compressed"],
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
    extensions: ["ttml", "dfxp"],
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
    id: "xml",
    label: "XML",
    extensions: ["xml"],
    mimeTypes: ["application/xml", "text/xml"],
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
    id: "docx",
    label: "Word document (DOCX)",
    extensions: ["docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    category: "document",
  },
  {
    id: "xlsx",
    label: "Excel workbook (XLSX)",
    extensions: ["xlsx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    category: "spreadsheet",
  },
  {
    id: "pptx",
    label: "PowerPoint presentation (PPTX)",
    extensions: ["pptx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    category: "presentation",
  },
  {
    id: "odt",
    label: "OpenDocument text (ODT)",
    extensions: ["odt"],
    mimeTypes: ["application/vnd.oasis.opendocument.text"],
    category: "document",
  },
  {
    id: "ods",
    label: "OpenDocument spreadsheet (ODS)",
    extensions: ["ods"],
    mimeTypes: ["application/vnd.oasis.opendocument.spreadsheet"],
    category: "spreadsheet",
  },
  {
    id: "odp",
    label: "OpenDocument presentation (ODP)",
    extensions: ["odp"],
    mimeTypes: ["application/vnd.oasis.opendocument.presentation"],
    category: "presentation",
  },
  {
    id: "epub",
    label: "EPUB ebook",
    extensions: ["epub"],
    mimeTypes: ["application/epub+zip"],
    category: "ebook",
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
    label: "PNG / APNG image",
    extensions: ["png", "apng"],
    mimeTypes: ["image/png", "image/apng"],
    category: "image",
  },
  {
    id: "apng",
    label: "Animated PNG (APNG)",
    extensions: ["apng"],
    mimeTypes: ["image/apng"],
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
    id: "jxl",
    label: "JPEG XL image",
    extensions: ["jxl"],
    mimeTypes: ["image/jxl"],
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
    id: "ico",
    label: "Windows icon (ICO)",
    extensions: ["ico"],
    mimeTypes: ["image/x-icon", "image/vnd.microsoft.icon"],
    category: "image",
  },
  {
    id: "tiff",
    label: "TIFF image",
    extensions: ["tif", "tiff"],
    mimeTypes: ["image/tiff"],
    category: "image",
  },
  {
    id: "svg",
    label: "SVG vector image",
    extensions: ["svg"],
    mimeTypes: ["image/svg+xml"],
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
    id: "mov",
    label: "QuickTime movie (MOV)",
    extensions: ["mov", "qt"],
    mimeTypes: ["video/quicktime"],
    category: "video",
  },
  {
    id: "3gp",
    label: "3GPP video (3GP)",
    extensions: ["3gp", "3gpp"],
    mimeTypes: ["video/3gpp", "audio/3gpp"],
    category: "video",
  },
  {
    id: "mpeg-ts",
    label: "MPEG transport stream",
    extensions: ["ts", "m2ts", "mts", "mpegts"],
    mimeTypes: ["video/mp2t"],
    category: "video",
  },
  {
    id: "flv",
    label: "Flash video (FLV)",
    extensions: ["flv", "f4v"],
    mimeTypes: ["video/x-flv"],
    category: "video",
  },
  {
    id: "avi",
    label: "Audio Video Interleave (AVI)",
    extensions: ["avi", "divx"],
    mimeTypes: ["video/x-msvideo", "video/avi"],
    category: "video",
  },
  {
    id: "mp4",
    label: "MP4 video",
    extensions: ["mp4"],
    mimeTypes: ["video/mp4"],
    category: "video",
  },
  {
    id: "m4a",
    label: "MPEG-4 audio (AAC or ALAC)",
    extensions: ["m4a"],
    mimeTypes: ["audio/mp4"],
    category: "audio",
  },
  {
    id: "alac",
    label: "Apple Lossless (ALAC in M4A)",
    extensions: ["m4a"],
    mimeTypes: ["audio/mp4"],
    category: "audio",
  },
  {
    id: "wma",
    label: "Windows Media Audio (tested WMA2)",
    extensions: ["wma"],
    mimeTypes: ["audio/x-ms-wma", "audio/x-ms-asf"],
    category: "audio",
  },
  {
    id: "aac",
    label: "Raw AAC audio (ADTS)",
    extensions: ["aac", "adts"],
    mimeTypes: ["audio/aac", "audio/aacp"],
    category: "audio",
  },
  {
    id: "amr",
    label: "Adaptive Multi-Rate Narrowband (AMR-NB)",
    extensions: ["amr"],
    mimeTypes: ["audio/amr"],
    category: "audio",
  },
  {
    id: "amr-wb",
    label: "Adaptive Multi-Rate Wideband (AMR-WB)",
    extensions: ["awb"],
    mimeTypes: ["audio/amr-wb"],
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
    id: "webm-vp9",
    label: "WebM video (VP9)",
    extensions: ["webm"],
    mimeTypes: ["video/webm"],
    category: "video",
  },
  {
    id: "webm-av1",
    label: "WebM video (AV1 stream copy)",
    extensions: ["webm"],
    mimeTypes: ["video/webm"],
    category: "video",
  },
  {
    id: "ogv",
    label: "Ogg video (OGV)",
    extensions: ["ogv", "ogm"],
    mimeTypes: ["video/ogg"],
    category: "video",
  },
  {
    id: "m2v",
    label: "MPEG-2 elementary video (M2V)",
    extensions: ["m2v", "mpv", "mpeg2"],
    mimeTypes: ["video/mpeg"],
    category: "video",
  },
  {
    id: "m4v",
    label: "MPEG-4 Part 2 elementary video (M4V)",
    extensions: ["m4v"],
    mimeTypes: ["video/x-m4v", "video/m4v"],
    category: "video",
  },
  {
    id: "h264",
    label: "H.264 elementary video (Annex B)",
    extensions: ["h264", "264", "avc"],
    mimeTypes: ["video/h264"],
    category: "video",
  },
  {
    id: "hevc",
    label: "HEVC/H.265 elementary video (Annex B)",
    extensions: ["hevc", "h265", "265"],
    mimeTypes: ["video/h265", "video/hevc"],
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
  ["csv-to-json", "csv", "json"],
  ["tsv-to-ndjson", "tsv", "ndjson"],
  ["tsv-to-json", "tsv", "json"],
  ["ndjson-to-csv", "ndjson", "csv"],
  ["ndjson-to-tsv", "ndjson", "tsv"],
  ["ndjson-to-json", "ndjson", "json"],
  ["json-to-ndjson", "json", "ndjson"],
  ["json-to-csv", "json", "csv"],
  ["json-to-tsv", "json", "tsv"],
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

const jxlOutputProfiles = [
  ["png-to-jxl", "png"],
  ["jpeg-to-jxl", "jpeg"],
  ["webp-to-jxl", "webp"],
  ["gif-to-jxl", "gif"],
  ["avif-to-jxl", "avif"],
  ["bmp-to-jxl", "bmp"],
] as const;

const avifOutputProfiles = [
  ["png-to-avif", "png"],
  ["jpeg-to-avif", "jpeg"],
  ["webp-to-avif", "webp"],
  ["gif-to-avif", "gif"],
  ["bmp-to-avif", "bmp"],
] as const;

const avifOutputMaxTestedBytes = {
  png: 482_505,
  jpeg: 51_804,
  webp: 185_794,
  gif: 281_853,
  bmp: 2_359_350,
} as const;

const icoOutputProfiles = [
  ["png-to-ico", "png"],
  ["jpeg-to-ico", "jpeg"],
  ["webp-to-ico", "webp"],
  ["gif-to-ico", "gif"],
  ["avif-to-ico", "avif"],
  ["bmp-to-ico", "bmp"],
] as const;

const animatedFrameArchiveProfiles = [
  ["png-to-zip", "png"],
  ["gif-to-zip", "gif"],
  ["webp-to-zip", "webp"],
] as const;

const animatedApngOutputProfiles = [
  ["gif-to-apng", "gif"],
  ["webp-to-apng", "webp"],
] as const;

const animatedGifOutputProfiles = [
  ["png-to-gif", "png"],
  ["webp-to-gif", "webp"],
] as const;

const animatedGifOutputMaxTestedBytes = {
  png: 482_505,
  webp: 185_794,
} as const;

const animatedApngOutputMaxTestedBytes = {
  gif: 281_853,
  webp: 185_794,
} as const;

const animatedFrameArchiveMaxTestedBytes = {
  png: 482_505,
  gif: 281_853,
  webp: 185_794,
} as const;

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
    id: "bzip2-compress",
    input: "binary",
    output: "bzip2",
    engine: "bzip2-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "BZIP2 stores a single byte stream, not a directory tree or original filename.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_456,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "bzip2-decompress",
    input: "bzip2",
    output: "binary",
    engine: "bzip2-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "The original filename is inferred from the .bz2 suffix.",
      "Concatenated BZIP2 members and trailing data are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_593_081,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-to-tar-bz2",
    input: "tar",
    output: "tar-bz2",
    engine: "bzip2-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "This bounded route accepts UTF-8 USTAR headers and rejects GNU/PAX extended records.",
      "Archives are validated but not extracted; original TAR entry bytes are preserved before compression.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_436_992,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-bz2-to-tar",
    input: "tar-bz2",
    output: "tar",
    engine: "bzip2-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "This bounded route accepts UTF-8 USTAR headers and rejects GNU/PAX extended records.",
      "Archives are validated but not extracted; original TAR entry bytes are preserved after decompression.",
      "Concatenated BZIP2 members and trailing data are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_592_763,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-bz2-to-zip",
    input: "tar-bz2",
    output: "zip",
    engine: "bzip2-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts BZIP2-compressed UTF-8 USTAR files and directories; rejects GNU/PAX records, links, special files, duplicate names, unsafe paths, concatenated members, and trailing data.",
      "Writes deterministic ZIP32 DEFLATE output and does not preserve USTAR owners, groups, modes, or device fields.",
      "ZIP64 output is not supported, so each entry and the completed ZIP must remain below 4 GiB; the central directory is capped at 8 MiB.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_592_763,
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
    id: "xz-compress",
    input: "binary",
    output: "xz",
    engine: "xz-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "XZ stores a single byte stream, not a directory tree or original filename.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_456,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "xz-decompress",
    input: "xz",
    output: "binary",
    engine: "xz-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "The original filename is inferred from the .xz suffix.",
      "Concatenated XZ streams and trailing data are rejected.",
      "Streams requiring more than 32 MiB of decoder memory are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_448_840,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "gzip-to-bzip2",
    input: "gzip",
    output: "bzip2",
    engine: "compression-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with GZIP",
      "WebAssembly",
      "Web Workers",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams GZIP decoding directly into fixed-memory BZIP2 encoding; no decompressed intermediate file is stored.",
      "GZIP filenames and timestamps are not carried into the BZIP2 stream.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_399,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "gzip-to-xz",
    input: "gzip",
    output: "xz",
    engine: "compression-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with GZIP",
      "WebAssembly",
      "Web Workers",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams GZIP decoding directly into fixed-memory XZ encoding; no decompressed intermediate file is stored.",
      "GZIP filenames and timestamps are not carried into the XZ stream.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_399,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "bzip2-to-gzip",
    input: "bzip2",
    output: "gzip",
    engine: "compression-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory BZIP2 decoding directly into GZIP encoding; no decompressed intermediate file is stored.",
      "Concatenated BZIP2 members and trailing data are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_593_081,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "bzip2-to-xz",
    input: "bzip2",
    output: "xz",
    engine: "compression-codec-pipeline",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory BZIP2 decoding directly into fixed-memory XZ encoding; no decompressed intermediate file is stored.",
      "Concatenated BZIP2 members and trailing data are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_593_081,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "xz-to-gzip",
    input: "xz",
    output: "gzip",
    engine: "compression-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory XZ decoding directly into GZIP encoding; no decompressed intermediate file is stored.",
      "XZ streams requiring more than 32 MiB of decoder memory, concatenated streams, and trailing data are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_448_840,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "xz-to-bzip2",
    input: "xz",
    output: "bzip2",
    engine: "compression-codec-pipeline",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory XZ decoding directly into fixed-memory BZIP2 encoding; no decompressed intermediate file is stored.",
      "XZ streams requiring more than 32 MiB of decoder memory, concatenated streams, and trailing data are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_448_840,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-to-tar-xz",
    input: "tar",
    output: "tar-xz",
    engine: "xz-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "This bounded route accepts UTF-8 USTAR headers and rejects GNU/PAX extended records.",
      "Archives are validated but not extracted; original TAR entry bytes are preserved before compression.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_436_992,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-xz-to-tar",
    input: "tar-xz",
    output: "tar",
    engine: "xz-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "This bounded route accepts UTF-8 USTAR headers and rejects GNU/PAX extended records.",
      "Archives are validated but not extracted; original TAR entry bytes are preserved after decompression.",
      "Concatenated XZ streams and trailing data are rejected.",
      "Streams requiring more than 32 MiB of decoder memory are rejected.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_449_796,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-xz-to-zip",
    input: "tar-xz",
    output: "zip",
    engine: "xz-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts XZ-compressed UTF-8 USTAR files and directories; rejects GNU/PAX records, links, special files, duplicate names, unsafe paths, concatenated streams, and trailing data.",
      "Writes deterministic ZIP32 DEFLATE output and does not preserve USTAR owners, groups, modes, or device fields.",
      "ZIP64 output is not supported, so each entry and the completed ZIP must remain below 4 GiB; the central directory is capped at 8 MiB.",
      "Streams requiring more than 32 MiB of decoder memory are rejected; decompression also stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_449_796,
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
    id: "tar-gz-to-tar-bz2",
    input: "tar-gz",
    output: "tar-bz2",
    engine: "archive-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with GZIP",
      "WebAssembly",
      "Web Workers",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams GZIP decode through the bounded UTF-8 USTAR validator directly into fixed-memory BZIP2 encoding; no intermediate TAR is stored.",
      "GNU/PAX records, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "USTAR entry bytes are preserved exactly; only the outer compression stream is replaced.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_551,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-gz-to-tar-xz",
    input: "tar-gz",
    output: "tar-xz",
    engine: "archive-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with GZIP",
      "WebAssembly",
      "Web Workers",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams GZIP decode through the bounded UTF-8 USTAR validator directly into fixed-memory XZ encoding; no intermediate TAR is stored.",
      "GNU/PAX records, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "USTAR entry bytes are preserved exactly; only the outer compression stream is replaced.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_551,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-bz2-to-tar-gz",
    input: "tar-bz2",
    output: "tar-gz",
    engine: "archive-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory BZIP2 decode through the bounded UTF-8 USTAR validator directly into GZIP encoding; no intermediate TAR is stored.",
      "GNU/PAX records, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "USTAR entry bytes are preserved exactly; only the outer compression stream is replaced.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_592_763,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-bz2-to-tar-xz",
    input: "tar-bz2",
    output: "tar-xz",
    engine: "archive-codec-pipeline",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory BZIP2 decode through the bounded UTF-8 USTAR validator directly into fixed-memory XZ encoding; no intermediate TAR is stored.",
      "GNU/PAX records, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "USTAR entry bytes are preserved exactly; only the outer compression stream is replaced.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_592_763,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-xz-to-tar-gz",
    input: "tar-xz",
    output: "tar-gz",
    engine: "archive-codec-pipeline",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory XZ decode through the bounded UTF-8 USTAR validator directly into GZIP encoding; no intermediate TAR is stored.",
      "XZ streams requiring more than 32 MiB of decoder memory, concatenated streams, trailing data, unsafe USTAR paths, duplicate names, and expansion above 100:1 are rejected.",
      "USTAR entry bytes are preserved exactly; only the outer compression stream is replaced.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_449_796,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-xz-to-tar-bz2",
    input: "tar-xz",
    output: "tar-bz2",
    engine: "archive-codec-pipeline",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Streams fixed-memory XZ decode through the bounded UTF-8 USTAR validator directly into fixed-memory BZIP2 encoding; no intermediate TAR is stored.",
      "XZ streams requiring more than 32 MiB of decoder memory, concatenated streams, trailing data, unsafe USTAR paths, duplicate names, and expansion above 100:1 are rejected.",
      "USTAR entry bytes are preserved exactly; only the outer compression stream is replaced.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_449_796,
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
    id: "tar-to-sevenzip",
    input: "tar",
    output: "sevenzip",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "Origin Private File System",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "This bounded route accepts regular files and directories in UTF-8 USTAR archives; GNU/PAX records, links, special files, duplicate names, and unsafe paths are rejected.",
      "A bounded 256 KiB sample selects mainstream LZMA2 preset 0 when compression is useful and lossless 7Z COPY when recompression would only waste time or increase size.",
      "Owners and permissions are sanitized; TAR padding and archive-level metadata are not preserved.",
      "The encoded payload is staged in app-owned private browser storage using bounded 64 KiB I/O and is deleted after success, failure, or cancellation.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_436_992,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-gz-to-sevenzip",
    input: "tar-gz",
    output: "sevenzip",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "Origin Private File System",
      "DecompressionStream with GZIP",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Streams GZIP decompression directly into the UTF-8 USTAR validator and 7Z writer; no complete intermediate TAR is stored.",
      "GNU/PAX records, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "A bounded 256 KiB decompressed sample selects LZMA2 preset 0 only when useful and otherwise selects lossless 7Z COPY.",
      "The seekable 7Z payload uses app-owned private browser scratch with bounded 64 KiB I/O and is deleted after success, failure, or cancellation.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_551,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-bz2-to-sevenzip",
    input: "tar-bz2",
    output: "sevenzip",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "Origin Private File System",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Streams fixed-memory BZIP2 decompression directly into the UTF-8 USTAR validator and 7Z writer; no complete intermediate TAR is stored.",
      "GNU/PAX records, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "A bounded 256 KiB decompressed sample selects LZMA2 preset 0 only when useful and otherwise selects lossless 7Z COPY.",
      "The seekable 7Z payload uses app-owned private browser scratch with bounded 64 KiB I/O and is deleted after success, failure, or cancellation.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 270_592_763,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tar-xz-to-sevenzip",
    input: "tar-xz",
    output: "sevenzip",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "Origin Private File System",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Streams a fixed 24 MiB decode-only XZ module directly into the UTF-8 USTAR validator and 7Z writer; no complete intermediate TAR is stored.",
      "The specialist XZ decoder enforces a 16 MiB liblzma allocation limit, sufficient for mainstream preset-6 streams with an 8 MiB dictionary; larger custom dictionaries are rejected.",
      "GNU/PAX records, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "A bounded 256 KiB decompressed sample selects LZMA2 preset 0 only when useful and otherwise selects lossless 7Z COPY.",
      "The seekable 7Z payload uses app-owned private browser scratch with bounded 64 KiB I/O and is deleted after success, failure, or cancellation.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_449_796,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "zip-to-sevenzip",
    input: "zip",
    output: "sevenzip",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "Origin Private File System",
      "DecompressionStream with raw DEFLATE",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts ZIP32 stored or DEFLATE entries and streams deterministic USTAR directly into the 7Z writer without storing a complete intermediate TAR.",
      "Encryption, ZIP64, multi-disk archives, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 are rejected.",
      "A bounded 256 KiB generated-USTAR sample selects LZMA2 preset 0 only when useful and otherwise selects lossless 7Z COPY.",
      "ZIP comments, extra fields, owners, permissions, and container metadata are not preserved; 7Z scratch is deleted after every terminal outcome.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_517,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "sevenzip-to-tar",
    input: "sevenzip",
    output: "tar",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts regular files and directories encoded with COPY, LZMA1, LZMA2, or PPMd; other 7Z codecs are rejected.",
      "Rejects encryption, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 after the first MiB.",
      "The deterministic USTAR output sanitizes permissions and owners and cannot preserve 7Z attributes or archive metadata.",
      "Fixed 56 MiB Wasm memory can safely reject unusually memory-intensive solid, large-dictionary, or BCJ2 archives.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_574,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "sevenzip-to-tar-gz",
    input: "sevenzip",
    output: "tar-gz",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts regular files and directories encoded with COPY, LZMA1, LZMA2, or PPMd; other 7Z codecs are rejected.",
      "Rejects encryption, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 after the first MiB.",
      "The streamed deterministic USTAR payload sanitizes permissions and owners before GZIP compression and cannot preserve 7Z attributes or archive metadata.",
      "Fixed 56 MiB Wasm memory can safely reject unusually memory-intensive solid, large-dictionary, or BCJ2 archives.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_574,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "sevenzip-to-tar-bz2",
    input: "sevenzip",
    output: "tar-bz2",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts regular files and directories encoded with COPY, LZMA1, LZMA2, or PPMd; other 7Z codecs are rejected.",
      "Rejects encryption, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 after the first MiB.",
      "Streams deterministic USTAR directly from the fixed-memory 7Z reader into BZIP2 level 1 with one bounded 64 KiB write outstanding and no complete intermediate archive.",
      "Owners, permissions, 7Z attributes, and archive-level metadata are not preserved.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_574,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "sevenzip-to-tar-xz",
    input: "sevenzip",
    output: "tar-xz",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts regular files and directories encoded with COPY, LZMA1, LZMA2, or PPMd; other 7Z codecs are rejected.",
      "Rejects encryption, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 after the first MiB.",
      "Streams deterministic USTAR directly from the fixed-memory 7Z reader into XZ preset 0 with one bounded 64 KiB write outstanding and no complete intermediate archive.",
      "Owners, permissions, 7Z attributes, and archive-level metadata are not preserved.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_574,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "sevenzip-to-zip",
    input: "sevenzip",
    output: "zip",
    engine: "libarchive7z-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts regular files and directories encoded with COPY, LZMA1, LZMA2, or PPMd; other 7Z codecs are rejected.",
      "Rejects encryption, links, special files, duplicate names, unsafe paths, more than 10,000 entries, more than 64 GiB of payload, and expansion above 100:1 after the first MiB.",
      "Writes deterministic ZIP32 DEFLATE output through a bounded USTAR bridge and does not preserve 7Z attributes, owners, permissions, or archive metadata.",
      "ZIP64 output is not supported, so each entry and the completed ZIP must remain below 4 GiB; the central directory is capped at 8 MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_435_574,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "zip-to-tar-gz",
    input: "zip",
    output: "tar-gz",
    engine: "archive-browser",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with raw DEFLATE",
      "CompressionStream with GZIP",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts ZIP32 archives with stored or DEFLATE entries and UTF-8 or ASCII names.",
      "Rejects encryption, ZIP64, multi-disk archives, links, special files, duplicate names, and unsafe paths.",
      "The bounded USTAR payload cannot preserve ZIP comments, extra fields, or permissions before GZIP compression.",
      "Expansion stops above 64 GiB, 10,000 entries, or a 100:1 ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_517,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "zip-to-tar-bz2",
    input: "zip",
    output: "tar-bz2",
    engine: "bzip2-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "DecompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts ZIP32 archives with stored or DEFLATE entries and UTF-8 or ASCII names; rejects encryption, ZIP64, multi-disk archives, links, special files, duplicate names, and unsafe paths.",
      "Builds deterministic USTAR with sanitized owners and permissions, then compresses it with BZIP2 level 1 through a bounded nested stream.",
      "ZIP comments, extra fields, permissions, and other container-specific metadata are not preserved.",
      "Expansion stops above 64 GiB, 10,000 entries, or a 100:1 ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_517,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "zip-to-tar-xz",
    input: "zip",
    output: "tar-xz",
    engine: "xz-wasm",
    route: "stream",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "DecompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts ZIP32 archives with stored or DEFLATE entries and UTF-8 or ASCII names; rejects encryption, ZIP64, multi-disk archives, links, special files, duplicate names, and unsafe paths.",
      "Builds deterministic USTAR with sanitized owners and permissions, then compresses it with XZ preset 0 and a CRC64 integrity check through a bounded nested stream.",
      "ZIP comments, extra fields, permissions, and other container-specific metadata are not preserved.",
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
    id: "tar-gz-to-zip",
    input: "tar-gz",
    output: "zip",
    engine: "archive-browser",
    route: "stream",
    browserRequirements: [
      "DecompressionStream with GZIP",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Accepts bounded UTF-8 USTAR files and directories; rejects GNU/PAX extensions, links, special files, duplicate names, and unsafe paths.",
      "Writes deterministic ZIP32 DEFLATE output and does not preserve USTAR owners, groups, modes, or device fields.",
      "ZIP64 output is not supported, so each entry and the completed ZIP must remain below 4 GiB.",
      "Decompression stops above 64 GiB or a 100:1 expansion ratio after the first MiB.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 268_517_551,
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
    id: "srt-to-ass",
    input: "srt",
    output: "ass",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "A deterministic default ASS style is generated because SRT has no script-level style sheet, canvas size, or font metadata.",
      "ASS stores centisecond timestamps; input times are rounded to the nearest centisecond and cues shorter than one centisecond are expanded to one centisecond.",
    ],
    fidelityLimitations: [
      "Cue timing, multiline text, entities, and basic italic, bold, and underline markup are preserved; unsupported HTML-like tags are removed.",
    ],
    maxTestedBytes: 67_327_792,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "vtt-to-ass",
    input: "vtt",
    output: "ass",
    engine: "subtitle-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "A deterministic default ASS style is generated; WebVTT header metadata, cue identifiers, positioning, regions, CSS classes, and unsupported markup are explicitly excluded.",
      "ASS stores centisecond timestamps; input times are rounded to the nearest centisecond and cues shorter than one centisecond are expanded to one centisecond.",
    ],
    fidelityLimitations: [
      "Cue timing, multiline text, entities, voice labels, and basic italic, bold, and underline markup are preserved.",
    ],
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
    id: "txt-to-docx",
    input: "txt",
    output: "docx",
    engine: "document-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Plain text has no document title, author, language, headings, styles, links, tables, embedded media, or package metadata to preserve.",
      "Input must be valid UTF-8 with lines no longer than 1 MiB; XML 1.0-forbidden control characters are rejected.",
      "The non-ZIP64 output is limited to 4 GiB and uses bounded streaming DEFLATE.",
    ],
    fidelityLimitations: [
      "Each source line becomes one Word paragraph, empty lines remain empty paragraphs, tabs become Word tab elements, and Unicode text and spaces are preserved.",
      "The output intentionally applies no inferred formatting or page layout.",
    ],
    maxTestedBytes: 67_130_000,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "txt-to-odt",
    input: "txt",
    output: "odt",
    engine: "document-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Plain text has no document title, author, language, headings, styles, links, tables, embedded media, or package metadata to preserve.",
      "Input must be valid UTF-8 with lines no longer than 1 MiB; XML 1.0-forbidden control characters are rejected.",
      "The non-ZIP64 ODF 1.3 package is limited to 4 GiB.",
    ],
    fidelityLimitations: [
      "Each source line becomes one OpenDocument paragraph; empty lines, leading and trailing spaces, repeated spaces, tabs, and Unicode text are represented explicitly.",
      "The output intentionally applies no inferred formatting or page layout.",
    ],
    maxTestedBytes: 67_130_000,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "txt-to-epub",
    input: "txt",
    output: "epub",
    engine: "document-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "Web Crypto",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Plain text has no title, author, language, headings, chapters, links, cover art, styling, or ebook metadata to preserve.",
      "Input must be valid UTF-8; XML 1.0-forbidden control characters are rejected.",
      "The non-ZIP64 EPUB 3.3 package is limited to 4 GiB.",
      "A deterministic content-derived UUID is generated because plain text does not carry a publication identifier.",
    ],
    fidelityLimitations: [
      "The entire source becomes one reflowable XHTML spine document; whitespace, tabs, line endings, Unicode text, and blank lines are preserved in a preformatted block.",
      "The output uses a generated title, undetermined language, minimal navigation, and no inferred formatting.",
    ],
    maxTestedBytes: 67_130_000,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "docx-to-txt",
    input: "docx",
    output: "txt",
    engine: "document-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Extracts the main Word document only; comments, headers, footers, notes, relationships, and document properties are omitted.",
      "Macro-enabled packages, unsafe ZIP paths, encrypted entries, ZIP64, DTDs, custom entities, and unsupported compression methods are rejected.",
    ],
    fidelityLimitations: [
      "Preserves paragraph order, tabs, line breaks, Unicode text, and accepted tracked insertions; tracked deletions are excluded.",
      "Formatting, images, drawings, fields, hyperlinks, styles, page layout, and table structure are not represented in plain text.",
    ],
    maxTestedBytes: 134_218_659,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "epub-to-txt",
    input: "epub",
    output: "txt",
    engine: "ebook-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Follows the OPF linear spine; non-linear resources, navigation controls, annotations, and package metadata are omitted.",
      "Encrypted or obfuscated resources, unsafe ZIP paths or references, ZIP64, archive bombs, DTDs, external entities, and non-UTF-8 XML/XHTML are rejected.",
    ],
    fidelityLimitations: [
      "Preserves visible chapter order, headings, paragraphs, lists, table-cell boundaries, and Unicode text.",
      "CSS, fonts, links, images, cover art, SVG, MathML, audio, video, scripts, and page layout are not represented in plain text.",
    ],
    maxTestedBytes: 134_219_595,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "xlsx-to-csv",
    input: "xlsx",
    output: "csv",
    engine: "spreadsheet-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Exports only the first visible worksheet; other visible and hidden worksheets, workbook metadata, charts, drawings, comments, hyperlinks, images, and print layout are omitted.",
      "Macro-enabled packages, unsafe ZIP paths or references, encrypted entries, ZIP64, archive bombs, malformed XML, DTDs, custom entities, and non-UTF-8 XML are rejected.",
      "Shared strings are bounded to 262,144 items, 8 MiB of characters, and 1 MiB per cell.",
    ],
    fidelityLimitations: [
      "Preserves worksheet coordinates and gaps, numbers, Booleans, errors, inline strings, Unicode, and bounded rich shared strings.",
      "Formulas are not recalculated; stored cached results are exported, and formulas without cached results become empty fields.",
      "Excel number formats and styles are not rendered, so date serials and formatted numbers are emitted as stored values.",
    ],
    maxTestedBytes: 135_267_834,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "pptx-to-txt",
    input: "pptx",
    output: "txt",
    engine: "presentation-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Follows declared slide order and includes hidden-slide text; comments, speaker notes, masters, themes, and package metadata are omitted.",
      "Macro-enabled packages, unsafe ZIP paths or references, encrypted entries, ZIP64, archive bombs, malformed XML, DTDs, custom entities, and non-UTF-8 XML are rejected.",
      "Presentation metadata parts are bounded to 2 MiB and presentations to 10,000 declared slides.",
    ],
    fidelityLimitations: [
      "Preserves DrawingML text-run order, paragraphs, tabs, line breaks, and Unicode text.",
      "Fonts, styling, positions, layouts, transitions, animations, charts, diagrams, equations, images, media, hyperlinks, and embedded objects are not represented in plain text.",
    ],
    maxTestedBytes: 135_296_355,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "odt-to-txt",
    input: "odt",
    output: "txt",
    engine: "odf-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Extracts the office:text body; headers, footers, annotations, tracked-change history, document properties, and embedded objects are omitted.",
      "Encrypted, macro-bearing, or scripted packages, unsafe ZIP paths, ZIP64, archive bombs, malformed XML, DTDs, custom entities, and non-UTF-8 XML are rejected.",
    ],
    fidelityLimitations: [
      "Preserves paragraph and heading order, tabs, explicit spaces, line breaks, Unicode text, and table-cell paragraphs.",
      "Styles, page layout, fields, drawings, images, equations, links, and indexes are not represented in plain text.",
    ],
    maxTestedBytes: 135_267_233,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ods-to-csv",
    input: "ods",
    output: "csv",
    engine: "odf-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Exports only the first visible sheet; other visible and hidden sheets, named ranges, validation, annotations, drawings, charts, images, and print layout are omitted.",
      "Encrypted, macro-bearing, or scripted packages, unsafe ZIP paths, ZIP64, archive bombs, malformed XML, DTDs, custom entities, and non-UTF-8 XML are rejected.",
      "Cells and rows are bounded to 1 MiB of text, 16,384 columns, and 1,048,576 output rows.",
    ],
    fidelityLimitations: [
      "Preserves cell order, repeated rows and columns, text, numbers, Booleans, dates, times, and cached formula values.",
      "Formulas are not recalculated and styles or number formats are not rendered.",
    ],
    maxTestedBytes: 135_267_401,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "odp-to-txt",
    input: "odp",
    output: "txt",
    engine: "odf-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "DecompressionStream",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "Follows declared page order and includes hidden-page text; speaker notes, masters, styles, and package metadata are omitted.",
      "Encrypted, macro-bearing, or scripted packages, unsafe ZIP paths, ZIP64, archive bombs, malformed XML, DTDs, custom entities, and non-UTF-8 XML are rejected.",
      "Presentations are bounded to 10,000 declared pages.",
    ],
    fidelityLimitations: [
      "Preserves text paragraph order, tabs, explicit spaces, line breaks, and Unicode text.",
      "Positions, transitions, animations, charts, drawings, images, media, links, equations, and embedded objects are not represented in plain text.",
    ],
    maxTestedBytes: 135_272_481,
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
    id: "md-to-epub",
    input: "md",
    output: "epub",
    engine: "document-stream",
    route: "stream",
    browserRequirements: [
      "Web Workers",
      "Web Crypto",
      "CompressionStream with raw DEFLATE",
      "File System Access",
    ],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "YAML front matter, footnotes, tables, task lists, definition lists, and Markdown extensions are not interpreted.",
      "Raw HTML is escaped instead of executed; input must be valid UTF-8 with lines and accumulated paragraphs no longer than 1 MiB.",
      "The non-ZIP64 EPUB 3.3 package is limited to 4 GiB and uses a generated content-derived UUIDv8 because Markdown carries no standardized publication identifier.",
    ],
    fidelityLimitations: [
      "One reflowable XHTML spine document preserves bounded headings, paragraphs, lists, blockquotes, rules, fenced code, safe links, emphasis, strong text, and inline code.",
      "The output uses a generated title, undetermined language, minimal navigation, and no inferred cover art or book metadata.",
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
      ...((input === "ndjson" || input === "json") &&
      output !== "json" &&
      output !== "ndjson"
        ? [
            "Columns are fixed by the first object; later extra keys are reported and ignored.",
            "Nested arrays and objects are serialized as JSON text inside one delimited field.",
          ]
        : (input === "csv" || input === "tsv") &&
            (output === "ndjson" || output === "json")
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
  {
    id: "xml-to-ndjson",
    input: "xml",
    output: "ndjson",
    engine: "xml-stream",
    route: "stream",
    browserRequirements: ["Web Workers", "File System Access"],
    cpuClass: "low",
    memoryClass: "bounded-low",
    metadataLimitations: [
      "The output is an ordered NDJSON event stream rather than an inferred application-specific object model.",
      "Qualified names and namespace declarations are preserved lexically; namespace URIs are not resolved.",
      "DTDs, custom entities, external entities, and non-UTF-8 XML declarations are rejected.",
    ],
    fidelityLimitations: [
      "Element and attribute order, empty-element syntax, text, CDATA distinction, comments, and processing instructions are represented; XML line endings and entity spellings are normalized.",
    ],
    maxTestedBytes: 134_218_700,
    automatedTestStatus: "passed",
    public: true,
  },
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
    metadataLimitations:
      output === "webp" && (input === "png" || input === "gif")
        ? [
            "Animated PNG/APNG and GIF inputs preserve every browser-decoded composited frame, equivalent playback repetition semantics, and millisecond-rounded timing in animated WebP; static inputs remain static.",
            "EXIF, ICC profiles, textual metadata, source compression settings, frame rectangles, disposal operations, and blend operations are not copied.",
            "At most 1,000 frames, 8,388,608 pixels per frame, a 1,000:1 aggregate decoded expansion ratio, WebP's 24-bit millisecond duration field, and the 64 MiB encoded-output safety limit are accepted.",
          ]
        : [
            "EXIF, ICC profiles, textual metadata, and animation are not preserved by this bounded still-image profile.",
          ],
    fidelityLimitations:
      output === "jpeg"
        ? ["JPEG output is lossy and cannot preserve transparency."]
        : output === "webp"
          ? [
              input === "png" || input === "gif"
                ? input === "png"
                  ? "Static PNG input uses lossy WebP quality 0.90; animated PNG/APNG input encodes each complete frame at the browser encoder's lossless maximum quality and preserves alpha."
                  : "Static or animated GIF input encodes every applicable complete frame at the browser WebP encoder's lossless maximum quality and preserves alpha."
                : "WebP output uses lossy quality 0.90.",
              ...(input === "png" || input === "gif"
                ? [
                    "Animated frame timing is rounded to the nearest nonzero millisecond because WebP cannot represent finer timing.",
                  ]
                : []),
            ]
          : output === "bmp"
            ? ["BMP output uses 24-bit color and cannot preserve transparency."]
          : [],
    maxTestedBytes: imageMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...jxlOutputProfiles.map(([id, input]) => ({
    id,
    input,
    output: "jxl",
    engine: "libjxl-encoder-wasm" as const,
    route: "re-encode" as const,
    browserRequirements:
      input === "bmp"
        ? ["WebAssembly", "Web Workers", "File System Access"]
        : ["ImageDecoder", "WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium" as const,
    memoryClass: "bounded-medium" as const,
    metadataLimitations: [
      "Static and animated inputs preserve every browser-decoded complete composited frame; animation uses an exact microsecond timebase and equivalent playback repetition semantics.",
      "EXIF, ICC profiles, textual metadata, source compression settings, frame rectangles, disposal operations, and blend operations are not copied.",
      "At most 1,000 frames, 8,388,608 pixels per frame, a 1,000:1 aggregate decoded expansion ratio, 64 GiB aggregate decoded data, and 128 MiB encoded output are accepted.",
      ...(input === "bmp"
        ? [
            "BMP input is decoded directly from bounded rows and accepts uncompressed 24-bit or 32-bit Windows BMP pixel arrays; compressed, paletted, and bitfield BMP variants are rejected.",
          ]
        : []),
    ],
    fidelityLimitations: [
      "Pinned libjxl 0.12.0 effort 1 losslessly preserves Chromium's decoded 8-bit sRGB or sRGBA pixels; higher source bit depths and source color profiles are converted by Chromium before encoding.",
    ],
    maxTestedBytes: imageMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...avifOutputProfiles.map(([id, input]) => ({
    id,
    input,
    output: "avif",
    engine: "libaom-avif-encoder-wasm" as const,
    route: "re-encode" as const,
    browserRequirements:
      input === "bmp"
        ? ["WebAssembly", "Web Workers", "File System Access"]
        : ["ImageDecoder", "WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "high" as const,
    memoryClass: "bounded-medium" as const,
    metadataLimitations: [
      "Static and animated inputs preserve every browser-decoded complete composited frame; animation uses an exact microsecond timebase and equivalent playback repetition semantics.",
      "EXIF, ICC profiles, textual metadata, source compression settings, frame rectangles, disposal operations, and blend operations are not copied.",
      "At most 1,000 frames, 786,432 pixels per frame, a 1,000:1 aggregate decoded expansion ratio, 64 GiB aggregate decoded data, and 128 MiB encoded output are accepted by the measured complete-Chromium memory ceiling.",
      ...(input === "bmp"
        ? [
            "BMP input is decoded directly from bounded rows and accepts uncompressed 24-bit or 32-bit Windows BMP pixel arrays; compressed, paletted, and bitfield BMP variants are rejected.",
          ]
        : []),
    ],
    fidelityLimitations: [
      "Pinned libaom 3.13.2 realtime encoding uses one thread, cpu-used 8, zero lookahead, YUV 4:2:0 color at CRF 32, and lossless grayscale alpha; higher source bit depths and source color profiles are converted by Chromium before encoding.",
    ],
    maxTestedBytes: avifOutputMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...icoOutputProfiles.map(([id, input]) => ({
    id,
    input,
    output: "ico",
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
      "The output contains one PNG-compressed icon image; alternate icon sizes, EXIF, ICC profiles, textual metadata, and animation are not preserved.",
    ],
    fidelityLimitations: [
      "Images larger than 256 pixels on either edge are scaled down proportionally to fit the ICO limit.",
    ],
    maxTestedBytes: imageMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...animatedFrameArchiveProfiles.map(([id, input]) => ({
    id,
    input,
    output: "zip",
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
      "Every complete animation frame is rendered to a numbered PNG in a ZIP archive; frame timestamps, durations, dimensions, and repetition count are recorded in animation.json.",
      "EXIF, ICC profiles, textual metadata, and format-specific animation metadata outside frame timing and repetition count are not preserved.",
      "At most 1,000 frames, 8,388,608 pixels per frame, a 1,000:1 aggregate decoded expansion ratio, and ZIP32 output are accepted.",
    ],
    fidelityLimitations: [
      "PNG frames losslessly preserve the browser-decoded composited pixels, but the original animation compression and disposal operations are not retained as editable source data.",
    ],
    maxTestedBytes: animatedFrameArchiveMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...animatedApngOutputProfiles.map(([id, input]) => ({
    id,
    input,
    output: "apng",
    engine: "image-browser" as const,
    route: "re-encode" as const,
    browserRequirements: [
      "ImageDecoder",
      "CompressionStream",
      "File System Access",
    ],
    cpuClass: "medium" as const,
    memoryClass: "bounded-medium" as const,
    metadataLimitations: [
      "Every browser-decoded composited frame is encoded as a complete APNG frame with its source duration and loop count; RGBA is copied and PNG-Sub filtered in strips no larger than 256 KiB.",
      "EXIF, ICC profiles, textual metadata, source compression settings, frame rectangles, disposal operations, and blend operations are not copied.",
      "At most 1,000 frames, 8,388,608 pixels per frame, a 1,000:1 aggregate decoded expansion ratio, and durations representable by APNG's 16-bit rational fields are accepted.",
    ],
    fidelityLimitations: [
      "APNG losslessly preserves Chromium's decoded composited pixels; timing is exact when its reduced rational fits APNG and otherwise uses the closest bounded 16-bit rational.",
    ],
    maxTestedBytes: animatedApngOutputMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  ...animatedGifOutputProfiles.map(([id, input]) => ({
    id,
    input,
    output: "gif",
    engine: "image-browser" as const,
    route: "re-encode" as const,
    browserRequirements: ["ImageDecoder", "File System Access"],
    cpuClass: "medium" as const,
    memoryClass: "bounded-medium" as const,
    metadataLimitations: [
      "Every browser-decoded composited frame is encoded as a complete GIF frame with equivalent playback repetition semantics; RGBA is copied and quantized in strips no larger than 256 KiB.",
      "EXIF, ICC profiles, textual metadata, source compression settings, frame rectangles, disposal operations, and blend operations are not copied.",
      "At most 1,000 frames, 8,388,608 pixels per frame, a 1,000:1 aggregate decoded expansion ratio, and durations representable by GIF's 16-bit centisecond field are accepted.",
    ],
    fidelityLimitations: [
      "GIF uses one deterministic RGB332 global palette with binary transparency; color is reduced to at most 255 opaque colors and alpha below 50% becomes transparent.",
      "Animated frame timing is rounded to the nearest nonzero centisecond because GIF cannot represent finer timing; a still frame without source timing uses GIF's valid zero delay.",
    ],
    maxTestedBytes: animatedGifOutputMaxTestedBytes[input],
    automatedTestStatus: "passed" as const,
    public: true,
  })),
  {
    id: "avif-to-zip",
    input: "avif",
    output: "zip",
    engine: "libavif-wasm",
    route: "re-encode",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Extracts up to 1,000 frames from an AVIF animation track at 8, 10, 12, or 16-bit source depth, with an 8,192-pixel edge, 8,388,608-pixel limit, and 16 MiB decoded-surface limit per frame; still-item-only AVIF is rejected by this animation profile.",
      "Each decoded frame is written incrementally as a stored PNG ZIP entry; exact timescale positions, durations, dimensions, channel counts, decoded sizes, and repetition count are recorded in animation.json.",
      "ICC profiles up to 4 MiB are embedded in each PNG; EXIF, XMP, crop, rotation, mirror transforms, and format-specific metadata outside frame timing and repetition count are rejected or not copied.",
    ],
    fidelityLimitations: [
      "PNG preserves the bounded RGB or RGBA frames decoded by pinned libavif/libaom and FFmpeg color conversion; chroma-subsampled lossy AVIF cannot reconstruct the pre-encoding source exactly.",
    ],
    maxTestedBytes: 23_391,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "svg-to-png",
    input: "svg",
    output: "png",
    engine: "svg-browser",
    route: "re-encode",
    browserRequirements: [
      "WebAssembly",
      "Web Workers",
      "File System Access",
    ],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Only self-contained UTF-8 SVG with explicit paired width and height, or the standard 300\u00d7150 intrinsic default, is accepted within a 4 MiB source and 8-megapixel raster budget.",
      "One self-contained mask and one bounded Gaussian blur, offset, flood, composite, merge, or blend filter chain may each be applied once within a 6-megapixel effect budget and eight total filter primitives; every effect region must be explicit and remain inside the raster.",
      "Scripts, CSS, event handlers, external resources, links, animation, text, unsupported filter primitives, DTDs, custom entities, CDATA, and processing instructions are rejected before rasterization.",
      "Vector structure, text editability, metadata, and color profiles are not retained in PNG output.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 470_390,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tiff-to-zip",
    input: "tiff",
    output: "zip",
    engine: "libtiff-wasm",
    route: "re-encode",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Every accepted TIFF image directory is decoded to a numbered PNG and streamed immediately into ZIP32 output; pages.json records ordered dimensions, sample depth, channel count, and decoded size.",
      "At most 1,000 pages, 16,777,216 pixels per page, 64 GiB aggregate decoded data, a 1,000:1 aggregate expansion ratio, and ZIP32 output are accepted.",
      "EXIF, ICC profiles, resolution, textual metadata, thumbnails, and private TIFF tags are not copied to PNG pages.",
    ],
    fidelityLimitations: [
      "Associated alpha is converted to PNG's unassociated alpha representation with bounded 8- or 16-bit rounding.",
    ],
    maxTestedBytes: 50_374_456,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "tiff-to-png",
    input: "tiff",
    output: "png",
    engine: "libtiff-wasm",
    route: "re-encode",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts one strip- or tile-organized contiguous or separated-planar grayscale, RGB, or RGBA image at 8 or 16 bits per sample; 8-bit palette images are also accepted.",
      "Supports none, PackBits, LZW, Deflate, and baseline JPEG compression plus TIFF orientations 1 through 8; transposed orientations use bounded output-row stripes, and multipage input converts only the first page with an explicit warning.",
      "EXIF, ICC profiles, resolution, textual metadata, thumbnails, and private TIFF tags are not copied to PNG.",
    ],
    fidelityLimitations: [
      "Associated alpha is converted to PNG's unassociated alpha representation with bounded 8- or 16-bit rounding.",
    ],
    maxTestedBytes: 50_348_250,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "jxl-to-png",
    input: "jxl",
    output: "png",
    engine: "libjxl-wasm",
    route: "re-encode",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Accepts grayscale, grayscale-alpha, RGB, and RGBA JPEG XL images with integer samples up to 16 bits, an 8,192-pixel edge limit, and an 8,388,608-pixel image limit.",
      "The encoded orientation is applied, associated alpha is converted to PNG's unassociated representation, and the target-data ICC profile is embedded when libjxl supplies one.",
      "Animation converts only the first fully rendered frame with an explicit warning; EXIF, XMP, preview images, thumbnails, text boxes, and non-alpha extra channels are not preserved as independent PNG metadata or channels.",
    ],
    fidelityLimitations: [
      "PNG losslessly preserves the bounded 8- or 16-bit pixels rendered by libjxl; lossy JPEG XL source information cannot be restored, and floating-point JPEG XL samples are not accepted by this profile.",
    ],
    maxTestedBytes: 630_393,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "jxl-to-zip",
    input: "jxl",
    output: "zip",
    engine: "libjxl-wasm",
    route: "re-encode",
    browserRequirements: ["WebAssembly", "Web Workers", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "Extracts up to 1,000 coalesced displayed frames from grayscale, grayscale-alpha, RGB, or RGBA JPEG XL at integer depths up to 16 bits, with an 8,192-pixel edge, 8,388,608-pixel limit, and 16 MiB decoded-surface limit per frame.",
      "Each frame is written incrementally as a stored PNG ZIP entry; animation timing, timebase, timecodes, last-frame state, and loop count are recorded in animation.json.",
      "The encoded orientation is applied and the target-data ICC profile is embedded in each PNG; EXIF, XMP, previews, thumbnails, frame names, text boxes, and non-alpha extra channels are not copied as independent metadata.",
    ],
    fidelityLimitations: [
      "PNG losslessly preserves each bounded coalesced frame rendered by libjxl; lossy JPEG XL source information cannot be restored, and floating-point JPEG XL samples are not accepted.",
    ],
    maxTestedBytes: 1_315_111,
    automatedTestStatus: "passed",
    public: true,
  },
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
    id: "mov-to-mp4",
    input: "mov",
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
      "QuickTime subtitle, timecode, data, and attached-picture streams are explicitly excluded.",
      "Source chapters are not copied by this fragmented-MP4 profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 149_251_969,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mov-to-m4a",
    input: "mov",
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
      "Video, subtitle, timecode, data, and cover-art streams are explicitly excluded from the audio-only destination.",
      "Source chapters are not copied into this M4A profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 149_251_969,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mov-to-wav",
    input: "mov",
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
      "Video, subtitle, timecode, data, and cover-art streams are explicitly excluded.",
      "WAV cannot preserve every QuickTime language, artwork, or container tag.",
      "Source chapters are not copied into WAV.",
    ],
    fidelityLimitations: [
      "AAC is decoded to uncompressed 16-bit little-endian PCM; 16-bit ALAC is decoded losslessly to the same PCM representation.",
    ],
    maxTestedBytes: 149_251_969,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "3gp-to-mp4",
    input: "3gp",
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
      "Lossless stream copy accepts H.264 video with AAC audio; other 3GP codec combinations require a separately verified route.",
      "3GP subtitle, timed-metadata, data, and attached-picture streams are explicitly excluded.",
      "Source chapters are not copied by this fragmented-MP4 profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 167_130_850,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "3gp-to-m4a",
    input: "3gp",
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
      "Lossless M4A extraction accepts AAC audio; other 3GP audio codecs require a separately verified route.",
      "Video, subtitle, timed-metadata, data, and cover-art streams are explicitly excluded from the audio-only destination.",
      "3GP-specific metadata and chapters are not copied into M4A.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 167_130_850,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "3gp-to-wav",
    input: "3gp",
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
      "Only the first AAC or 8 kHz mono AMR-NB audio stream is converted; AMR-NB is certified through 156,907,373 bytes.",
      "Video, subtitle, timed-metadata, data, cover-art, and additional audio streams are explicitly excluded.",
      "WAV cannot preserve 3GP metadata, language descriptors, artwork, or chapters.",
    ],
    fidelityLimitations: [
      "AAC or AMR-NB is decoded and encoded as uncompressed 16-bit little-endian PCM; this cannot restore information already discarded by either source codec.",
    ],
    maxTestedBytes: 167_130_850,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mpeg-ts-to-mp4",
    input: "mpeg-ts",
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
      "Transport-stream programs, service data, teletext, subtitles, and unsupported data streams are explicitly excluded.",
      "Source chapters are not copied by this fragmented-MP4 profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 175_444_796,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mpeg-ts-to-m4a",
    input: "mpeg-ts",
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
      "Video, additional programs, subtitles, teletext, and data streams are explicitly excluded from the audio-only destination.",
      "Transport-specific service metadata and chapters are not copied into M4A.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 175_444_796,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mpeg-ts-to-wav",
    input: "mpeg-ts",
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
      "Video, additional programs, subtitles, teletext, and data streams are explicitly excluded.",
      "WAV cannot preserve transport-service metadata, language descriptors, artwork, or chapters.",
    ],
    fidelityLimitations: [
      "AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 175_444_796,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "flv-to-mp4",
    input: "flv",
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
      "Lossless stream copy accepts H.264 video with AAC audio; other FLV codecs are rejected unless a separately verified re-encoding route is selected.",
      "FLV script-data, cue points, unsupported data streams, and unsupported metadata are explicitly excluded.",
      "Source chapters are not copied by this fragmented-MP4 profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 167_517_193,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "flv-to-m4a",
    input: "flv",
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
      "Lossless M4A extraction accepts AAC audio; other FLV audio codecs require a separately verified re-encoding route.",
      "Video, script-data, cue points, and unsupported data streams are explicitly excluded from the audio-only destination.",
      "FLV-specific metadata and chapters are not copied into M4A.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 167_517_193,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "flv-to-wav",
    input: "flv",
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
      "Video, script-data, cue points, and unsupported data streams are explicitly excluded.",
      "WAV cannot preserve FLV metadata, language descriptors, artwork, or chapters.",
    ],
    fidelityLimitations: [
      "AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 167_517_193,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "avi-to-mp4",
    input: "avi",
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
      "Lossless stream copy accepts MPEG-4 Part 2 video with MP3 audio; other AVI codec combinations require a separately verified route.",
      "AVI subtitle, data, attached-picture, and unsupported auxiliary streams are explicitly excluded.",
      "AVI metadata and chapters are not copied by this fragmented-MP4 profile.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 230_929_466,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "avi-to-wav",
    input: "avi",
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
      "Only the first MP3 audio stream is converted.",
      "Video, subtitle, data, attached-picture, and additional audio streams are explicitly excluded.",
      "WAV cannot preserve AVI metadata or chapters.",
    ],
    fidelityLimitations: [
      "MP3 is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 230_929_466,
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
    id: "aac-to-m4a",
    input: "aac",
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
      "Raw ADTS carries no chapters, artwork, language tag, or general container metadata to preserve.",
      "AAC frame timing is synthesized by the ADTS demuxer and written into fragmented M4A.",
    ],
    fidelityLimitations: [
      "AAC frames are copied losslessly; ADTS transport headers are replaced with MPEG-4 AudioSpecificConfig metadata.",
    ],
    maxTestedBytes: 134_367_785,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "aac-to-wav",
    input: "aac",
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
      "Only the raw AAC audio stream is converted.",
      "WAV cannot preserve ADTS transport fields and raw ADTS has no container artwork, chapters, or general tags.",
    ],
    fidelityLimitations: [
      "Lossy AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 134_367_785,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "aac-to-flac",
    input: "aac",
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
      "Only the raw AAC audio stream is converted and raw ADTS supplies no artwork, chapters, language tag, or general container metadata.",
    ],
    fidelityLimitations: [
      "FLAC preserves the decoded 16-bit PCM but cannot restore information already discarded by AAC encoding.",
    ],
    maxTestedBytes: 134_367_785,
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
    id: "mp4-to-wav",
    input: "mp4",
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
      "Video, subtitle, and cover-art streams are explicitly excluded.",
      "WAV cannot preserve every MPEG-4 language, artwork, or container tag.",
      "Source chapters are not copied into WAV.",
    ],
    fidelityLimitations: [
      "AAC is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 2_964_855_971,
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
    maxTestedBytes: 140_941_469,
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
  standaloneAiffProfile("m4a"),
  standaloneAiffProfile("aac"),
  standaloneAiffProfile("amr"),
  standaloneAiffProfile("mp3"),
  standaloneAiffProfile("flac"),
  standaloneAiffProfile("wav"),
  standaloneAiffProfile("wma"),
  standaloneAiffProfile("ogg"),
  standaloneAiffProfile("opus"),
  containerAiffProfile("mkv"),
  containerAiffProfile("mp4"),
  containerAiffProfile("mov"),
  containerAiffProfile("mpeg-ts"),
  containerAiffProfile("flv"),
  containerAiffProfile("avi"),
  containerAiffProfile("ogv"),
  containerAiffProfile("webm"),
  webmAudioOutputProfile("wav"),
  webmAudioOutputProfile("flac"),
  webmAudioOutputProfile("amr"),
  webmAudioOutputProfile("mp3"),
  webmAudioOutputProfile("aac"),
  containerAmrOutputProfile("mkv"),
  containerAmrOutputProfile("mp4"),
  containerAmrOutputProfile("mov"),
  containerAmrOutputProfile("mpeg-ts"),
  containerAmrOutputProfile("flv"),
  containerAmrOutputProfile("avi"),
  containerAmrOutputProfile("ogv"),
  legacyContainerAacOutputProfile("avi"),
  legacyContainerAacOutputProfile("ogv"),
  containerLossyAudioProfile("mp4", "opus"),
  containerLossyAudioProfile("mov", "opus"),
  containerLossyAudioProfile("mpeg-ts", "opus"),
  containerLossyAudioProfile("flv", "opus"),
  containerLossyAudioProfile("avi", "opus"),
  containerLossyAudioProfile("ogv", "opus"),
  containerLossyAudioProfile("mp4", "ogg"),
  containerLossyAudioProfile("mov", "ogg"),
  containerLossyAudioProfile("mpeg-ts", "ogg"),
  containerLossyAudioProfile("flv", "ogg"),
  containerLossyAudioProfile("avi", "ogg"),
  containerLossyAudioProfile("ogv", "mp3"),
  containerM4aProfile("avi"),
  containerM4aProfile("ogv"),
  containerM4aProfile("webm"),
  threeGpAmrExtractionProfile,
  standaloneAmrOutputProfile("m4a"),
  standaloneAmrOutputProfile("aac"),
  standaloneAmrOutputProfile("mp3"),
  standaloneAmrOutputProfile("flac"),
  standaloneAmrOutputProfile("wav"),
  standaloneAmrOutputProfile("wma"),
  standaloneAmrOutputProfile("aiff"),
  standaloneAmrOutputProfile("ogg"),
  standaloneAmrOutputProfile("opus"),
  standaloneMp3OutputProfile("m4a"),
  standaloneMp3OutputProfile("aac"),
  standaloneMp3OutputProfile("amr"),
  standaloneMp3OutputProfile("flac"),
  standaloneMp3OutputProfile("wav"),
  standaloneMp3OutputProfile("wma"),
  standaloneMp3OutputProfile("aiff"),
  standaloneMp3OutputProfile("ogg"),
  standaloneMp3OutputProfile("opus"),
  standaloneAacOutputProfile("m4a"),
  standaloneAacOutputProfile("amr"),
  standaloneAacOutputProfile("mp3"),
  standaloneAacOutputProfile("flac"),
  standaloneAacOutputProfile("wav"),
  standaloneAacOutputProfile("wma"),
  standaloneAacOutputProfile("aiff"),
  standaloneAacOutputProfile("ogg"),
  standaloneAacOutputProfile("opus"),
  standaloneOpusOutputProfile("m4a"),
  standaloneOpusOutputProfile("aac"),
  standaloneOpusOutputProfile("amr"),
  standaloneOpusOutputProfile("mp3"),
  standaloneOpusOutputProfile("flac"),
  standaloneOpusOutputProfile("wav"),
  standaloneOpusOutputProfile("wma"),
  standaloneOpusOutputProfile("aiff"),
  standaloneOpusOutputProfile("ogg"),
  standaloneVorbisOutputProfile("m4a"),
  standaloneVorbisOutputProfile("aac"),
  standaloneVorbisOutputProfile("amr"),
  standaloneVorbisOutputProfile("amr-wb"),
  standaloneVorbisOutputProfile("mp3"),
  standaloneVorbisOutputProfile("flac"),
  standaloneVorbisOutputProfile("wav"),
  standaloneVorbisOutputProfile("wma"),
  standaloneVorbisOutputProfile("aiff"),
  standaloneVorbisOutputProfile("opus"),
  threeGpAmrOutputProfile("aiff"),
  threeGpAmrOutputProfile("mp3"),
  threeGpAmrOutputProfile("opus"),
  threeGpAmrOutputProfile("ogg"),
  containerFlacProfile("mkv"),
  containerFlacProfile("mp4"),
  containerFlacProfile("mov"),
  containerFlacProfile("3gp"),
  containerFlacProfile("mpeg-ts"),
  containerFlacProfile("flv"),
  containerFlacProfile("avi"),
  containerFlacProfile("ogv"),
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
      "For AAC input, FLAC preserves decoded 16-bit PCM but cannot restore discarded source information; 16-bit ALAC input remains sample-exact.",
    ],
    maxTestedBytes: 140_941_469,
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
    id: "aiff-to-flac",
    input: "aiff",
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
      "The certified input is signed 16-bit big-endian PCM AIFF; AIFF-only chunks and embedded artwork are excluded.",
      "Compatible text metadata is copied when FLAC can represent it.",
    ],
    fidelityLimitations: [],
    maxTestedBytes: 220_800_108,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ogg-to-flac",
    input: "ogg",
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
      "The certified input codec is Vorbis in Ogg; other Ogg audio codecs use separately tested profiles.",
      "Compatible Vorbis comments are copied into FLAC; embedded artwork is excluded.",
    ],
    fidelityLimitations: [
      "Vorbis is lossy; FLAC preserves the decoded 16-bit representation but cannot restore discarded source information.",
    ],
    maxTestedBytes: 144_431_506,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "opus-to-flac",
    input: "opus",
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
      "The certified input codec is Opus in Ogg; compatible comments are copied into FLAC and embedded artwork is excluded.",
    ],
    fidelityLimitations: [
      "Opus is lossy; FLAC preserves the decoded 16-bit representation but cannot restore discarded source information.",
    ],
    maxTestedBytes: 147_964_541,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "wav-to-alac",
    input: "wav",
    output: "alac",
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
      "RIFF-only metadata and embedded artwork cannot be represented by this bounded audio profile.",
    ],
    fidelityLimitations: [
      "The PCM samples are encoded losslessly as 16-bit Apple Lossless audio in fragmented M4A.",
    ],
    maxTestedBytes: 153_600_106,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "flac-to-alac",
    input: "flac",
    output: "alac",
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
      "FLAC comments are copied only when the M4A container can represent them; embedded artwork is excluded.",
    ],
    fidelityLimitations: [
      "16-bit FLAC samples remain lossless; higher source bit depths are reduced to signed 16-bit before ALAC encoding.",
    ],
    maxTestedBytes: 138_185_686,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "wma-to-wav",
    input: "wma",
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
      "The certified input codec is WMA2; broader WMA-family variants remain outside the tested public matrix.",
      "ASF artwork and container-only tags are excluded.",
    ],
    fidelityLimitations: [
      "Lossy WMA audio is decoded and represented as signed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 142_503_082,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "wma-to-flac",
    input: "wma",
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
      "The certified input codec is WMA2; broader WMA-family variants remain outside the tested public matrix.",
      "ASF artwork and container-only tags are excluded.",
    ],
    fidelityLimitations: [
      "FLAC preserves the decoded 16-bit representation but cannot restore information already lost by WMA compression.",
    ],
    maxTestedBytes: 142_503_082,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "wav-to-wma",
    input: "wav",
    output: "wma",
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
      "Compatible text tags are copied into ASF; RIFF-only metadata and artwork are excluded.",
    ],
    fidelityLimitations: [
      "Audio is resampled to 48 kHz when needed and encoded as lossy WMA2 at 320 kbit/s; layouts above stereo are downmixed to stereo.",
    ],
    maxTestedBytes: 153_600_104,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "flac-to-wma",
    input: "flac",
    output: "wma",
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
      "Compatible FLAC comments are copied into ASF; embedded artwork is excluded.",
    ],
    fidelityLimitations: [
      "Audio is resampled to 48 kHz when needed and encoded as lossy WMA2 at 320 kbit/s; layouts above stereo are downmixed to stereo.",
    ],
    maxTestedBytes: 138_186_536,
    automatedTestStatus: "passed",
    public: true,
  },
  standaloneWmaOutputProfile("m4a"),
  standaloneWmaOutputProfile("aac"),
  standaloneWmaOutputProfile("amr-wb"),
  standaloneWmaOutputProfile("mp3"),
  standaloneWmaOutputProfile("aiff"),
  standaloneWmaOutputProfile("ogg"),
  standaloneWmaOutputProfile("opus"),
  containerWmaOutputProfile("mkv"),
  containerWmaOutputProfile("mp4"),
  containerWmaOutputProfile("mov"),
  containerWmaOutputProfile("3gp"),
  containerWmaOutputProfile("mpeg-ts"),
  containerWmaOutputProfile("flv"),
  containerWmaOutputProfile("avi"),
  containerWmaOutputProfile("ogv"),
  containerWmaOutputProfile("webm"),
  {
    id: "amr-to-wav",
    input: "amr",
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
      "The certified input is a raw 8 kHz mono AMR-NB stream; AMR-WB and 3GP-contained variants remain outside this profile.",
      "Raw AMR has no general tag or artwork representation to preserve in WAV.",
    ],
    fidelityLimitations: [
      "Lossy AMR-NB audio is decoded and represented as signed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 134_229_414,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-to-flac",
    input: "amr",
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
      "The certified input is a raw 8 kHz mono AMR-NB stream; AMR-WB and 3GP-contained variants remain outside this profile.",
      "Raw AMR has no general tag or artwork representation to preserve in FLAC.",
    ],
    fidelityLimitations: [
      "FLAC preserves the decoded 16-bit representation but cannot restore information already lost by AMR-NB compression.",
    ],
    maxTestedBytes: 134_229_414,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-wb-to-wav",
    input: "amr-wb",
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
      "The certified input is mono 16 kHz AMR-WB in a 3GP/ISOBMFF .awb file.",
      "Only the first audio stream is converted; container metadata, artwork, chapters, and additional streams are excluded.",
    ],
    fidelityLimitations: [
      "Lossy AMR-WB audio is decoded and represented as signed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 137_420_809,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-wb-to-flac",
    input: "amr-wb",
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
      "The certified input is mono 16 kHz AMR-WB in a 3GP/ISOBMFF .awb file.",
      "Only the first audio stream is converted; container metadata, artwork, chapters, and additional streams are excluded.",
    ],
    fidelityLimitations: [
      "FLAC losslessly preserves the decoded signed 16-bit representation but cannot restore information discarded by AMR-WB compression.",
    ],
    maxTestedBytes: 137_420_809,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-wb-to-mp3",
    input: "amr-wb",
    output: "mp3",
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
      "The certified input is mono 16 kHz AMR-WB in a 3GP/ISOBMFF .awb file.",
      "Only the first audio stream is converted; container metadata, artwork, chapters, and additional streams are excluded.",
    ],
    fidelityLimitations: [
      "Lossy AMR-WB audio is re-encoded as mono 16 kHz, 64 kbit/s MP3; discarded source information cannot be restored.",
    ],
    maxTestedBytes: 137_420_809,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-wb-to-aiff",
    input: "amr-wb",
    output: "aiff",
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
      "The certified input is mono 16 kHz AMR-WB in a 3GP/ISOBMFF .awb file.",
      "Only the first audio stream is converted; container metadata, artwork, chapters, and additional streams are excluded.",
    ],
    fidelityLimitations: [
      "Lossy AMR-WB audio is decoded and represented as signed 16-bit big-endian PCM.",
    ],
    maxTestedBytes: 137_420_809,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-wb-to-opus",
    input: "amr-wb",
    output: "opus",
    engine: "ffmpeg-audio",
    route: "re-encode",
    browserRequirements: ["WebAssembly", "SharedArrayBuffer", "cross-origin isolation", "File System Access"],
    cpuClass: "medium",
    memoryClass: "bounded-medium",
    metadataLimitations: [
      "The certified input is mono 16 kHz AMR-WB in a 3GP/ISOBMFF .awb file.",
      "Only the first audio stream is converted; container metadata, artwork, chapters, and additional streams are excluded.",
    ],
    fidelityLimitations: [
      "Lossy AMR-WB audio is re-encoded as 64 kbit/s VBR Opus at its preserved 16 kHz processing rate; discarded source information cannot be restored.",
    ],
    maxTestedBytes: 137_420_809,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "amr-wb-to-aac",
    input: "amr-wb",
    output: "aac",
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
      "The certified input is mono 16 kHz AMR-WB in a 3GP/ISOBMFF .awb file.",
      "Only the first audio stream is converted; container metadata, artwork, chapters, and additional streams are excluded.",
    ],
    fidelityLimitations: [
      "Lossy AMR-WB audio is re-encoded as mono 16 kHz, 128 kbit/s AAC-LC; discarded source information cannot be restored.",
    ],
    maxTestedBytes: 137_420_809,
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
    id: "mp4-to-webm",
    input: "mp4",
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
      "Only the first non-attached video stream is converted.",
      "Audio, subtitles, attachments, additional video streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "Video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy VP8 at 600 kbit/s with no lookahead.",
    ],
    maxTestedBytes: 161_758_724,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mov-to-webm",
    input: "mov",
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
      "Only the first non-attached video stream is converted.",
      "Audio, subtitles, attachments, additional video streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "Video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy VP8 at 600 kbit/s with no lookahead.",
    ],
    maxTestedBytes: 147_136_647,
    automatedTestStatus: "passed",
    public: true,
  },
  legacyContainerWebmProfile("3gp", false),
  legacyContainerWebmProfile("mpeg-ts", false),
  legacyContainerWebmProfile("flv", false),
  aviWebmProfile(false),
  {
    id: "ogv-to-webm",
    input: "ogv",
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
      "Only the first Theora video stream is converted and the first Vorbis audio stream is preserved.",
      "Additional video/audio streams, subtitles, attachments, and chapters are explicitly excluded.",
      "Compatible language, aspect-ratio, color, and general metadata are copied where WebM can represent them.",
      "Variable frame timing is normalized to the average source frame rate.",
    ],
    fidelityLimitations: [
      "Theora video is decoded and encoded as lossy VP8 at 600 kbit/s with no lookahead; Vorbis audio is copied losslessly.",
      "Video wider than 640 pixels is proportionally downscaled to enforce the measured CPU and memory budget.",
    ],
    maxTestedBytes: 137_778_644,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mkv-to-webm-vp9",
    input: "mkv",
    output: "webm-vp9",
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
      "This specialist profile converts only the first non-attached video stream.",
      "Audio, subtitles, attachments, additional video streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "Video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy VP9 at 600 kbit/s in realtime mode with no lookahead.",
    ],
    maxTestedBytes: 181_825_549,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mp4-to-webm-vp9",
    input: "mp4",
    output: "webm-vp9",
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
      "Only the first non-attached video stream is converted.",
      "Audio, subtitles, attachments, additional video streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "Video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy VP9 at 600 kbit/s in realtime mode with no lookahead.",
    ],
    maxTestedBytes: 147_136_625,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "mov-to-webm-vp9",
    input: "mov",
    output: "webm-vp9",
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
      "Only the first non-attached video stream is converted.",
      "Audio, subtitles, attachments, additional video streams, and chapters are explicitly excluded.",
      "Variable frame timing and rotation side data are not preserved; output uses the average source frame rate.",
      "Compatible aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "Video is decoded, downscaled to at most 640 pixels wide, and encoded as lossy VP9 at 600 kbit/s in realtime mode with no lookahead.",
    ],
    maxTestedBytes: 147_136_647,
    automatedTestStatus: "passed",
    public: true,
  },
  legacyContainerWebmProfile("3gp", true),
  legacyContainerWebmProfile("mpeg-ts", true),
  legacyContainerWebmProfile("flv", true),
  aviWebmProfile(true),
  {
    id: "ogv-to-webm-vp9",
    input: "ogv",
    output: "webm-vp9",
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
      "Only the first Theora video stream is converted and the first Vorbis audio stream is preserved.",
      "Additional video/audio streams, subtitles, attachments, and chapters are explicitly excluded.",
      "Compatible language, aspect-ratio, color, stream, and general metadata are copied where WebM can represent them.",
      "Variable frame timing is normalized to the average source frame rate.",
    ],
    fidelityLimitations: [
      "Theora video is decoded and encoded as lossy VP9 at 600 kbit/s in realtime mode with no lookahead; Vorbis audio is copied losslessly.",
      "Video wider than 640 pixels is proportionally downscaled to enforce the measured CPU and memory budget.",
    ],
    maxTestedBytes: 137_635_308,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "m2v-to-webm-vp9",
    input: "m2v",
    output: "webm-vp9",
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
      "Only the MPEG-2 elementary video stream is converted; elementary streams contain no audio, chapters, attachments, or general container metadata.",
      "Frame timestamps are synthesized from the detected source frame rate.",
      "Compatible aspect-ratio and color descriptors are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "MPEG-2 video is decoded and encoded as lossy VP9 at 600 kbit/s in realtime mode with no lookahead.",
      "Video wider than 640 pixels is proportionally downscaled; timing is normalized to the detected average frame rate.",
    ],
    maxTestedBytes: 136_166_136,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "ogv-to-wav",
    input: "ogv",
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
      "Only the first Vorbis audio stream is converted.",
      "Video, subtitle, attachment, and additional audio streams are explicitly excluded.",
      "WAV cannot preserve Ogg metadata, language descriptors, artwork, or chapters.",
    ],
    fidelityLimitations: [
      "Vorbis is decoded and encoded as uncompressed 16-bit little-endian PCM.",
    ],
    maxTestedBytes: 137_635_308,
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
    maxTestedBytes: 2_958_573_265,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "m2v-to-mp4-mpeg4",
    input: "m2v",
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
      "Only the MPEG-2 elementary video stream is converted; elementary streams contain no audio, chapters, attachments, or general container metadata.",
      "Frame timestamps are synthesized from the detected source frame rate.",
      "Compatible aspect-ratio and color descriptors are copied where MP4 can represent them.",
    ],
    fidelityLimitations: [
      "MPEG-2 video is decoded and encoded as lossy MPEG-4 Part 2 at 2 Mbit/s with no B-frames.",
      "This bounded profile accepts YUV 4:2:0 decoded frames and normalizes timing to the detected average frame rate.",
    ],
    maxTestedBytes: 136_166_136,
    automatedTestStatus: "passed",
    public: true,
  },
  {
    id: "m2v-to-webm",
    input: "m2v",
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
      "Only the MPEG-2 elementary video stream is converted; elementary streams contain no audio, chapters, attachments, or general container metadata.",
      "Frame timestamps are synthesized from the detected source frame rate.",
      "Compatible aspect-ratio and color descriptors are copied where WebM can represent them.",
    ],
    fidelityLimitations: [
      "MPEG-2 video is decoded and encoded as lossy VP8 at 600 kbit/s with no lookahead.",
      "Video wider than 640 pixels is proportionally downscaled; timing is normalized to the detected average frame rate.",
    ],
    maxTestedBytes: 136_166_136,
    automatedTestStatus: "passed",
    public: true,
  },
  h264InputProfile("mp4"),
  h264InputProfile("webm"),
  h264InputProfile("webm-vp9"),
  containerH264Profile("mkv"),
  containerH264Profile("mp4"),
  containerH264Profile("mov"),
  containerH264Profile("3gp"),
  containerH264Profile("mpeg-ts"),
  containerH264Profile("flv"),
  containerHevcProfile("mkv"),
  containerHevcProfile("mp4"),
  containerHevcProfile("mov"),
  containerHevcProfile("mpeg-ts"),
  containerMatroskaProfile("mp4"),
  containerMatroskaProfile("mov"),
  containerMatroskaProfile("3gp"),
  containerMatroskaProfile("mpeg-ts"),
  containerMatroskaProfile("flv"),
  containerMatroskaProfile("avi"),
  containerMatroskaProfile("webm"),
  containerMatroskaProfile("ogv"),
  containerMpegTsProfile("mkv"),
  containerMpegTsProfile("mp4"),
  containerMpegTsProfile("mov"),
  containerMpegTsProfile("3gp"),
  containerMpegTsProfile("flv"),
  containerThreeGpProfile("mkv"),
  containerThreeGpProfile("mp4"),
  containerThreeGpProfile("mov"),
  containerThreeGpProfile("mpeg-ts"),
  containerThreeGpProfile("flv"),
  containerMovProfile("mkv"),
  containerMovProfile("mp4"),
  containerMovProfile("3gp"),
  containerMovProfile("mpeg-ts"),
  containerMovProfile("flv"),
  containerFlvProfile("mkv"),
  containerFlvProfile("mp4"),
  containerFlvProfile("mov"),
  containerFlvProfile("3gp"),
  containerFlvProfile("mpeg-ts"),
  mpeg2TransportProfile(),
  containerMpeg2Profile("mkv"),
  containerMpeg2Profile("mp4"),
  containerMpeg2Profile("mov"),
  containerMpeg2Profile("avi"),
  containerMpeg2Profile("mpeg-ts"),
  m4vMp4Profile(),
  containerM4vProfile("mkv"),
  containerM4vProfile("mp4"),
  containerM4vProfile("mov"),
  containerM4vProfile("avi"),
  av1WebmProfile(),
  containerMp3Profile("mkv"),
  containerMp3Profile("mp4"),
  containerMp3Profile("mov"),
  containerMp3Profile("avi"),
  containerMp3Profile("mpeg-ts"),
  containerMp3Profile("flv"),
  containerAacProfile("mkv"),
  containerAacProfile("mp4"),
  containerAacProfile("mov"),
  containerAacProfile("3gp"),
  containerAacProfile("mpeg-ts"),
  containerAacProfile("flv"),
  containerOggAudioProfile("mkv", "ogg"),
  containerOggAudioProfile("webm", "ogg"),
  containerOggAudioProfile("ogv", "ogg"),
  containerOggAudioProfile("mkv", "opus"),
  containerOggAudioProfile("webm", "opus"),
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
      (profile.input === input ||
        (profile.id === "gzip-compress" && input !== "gzip") ||
        (profile.id === "bzip2-compress" && input !== "bzip2") ||
        (profile.id === "xz-compress" && input !== "xz")) &&
      (includePending ||
        (profile.public && profile.automatedTestStatus === "passed")),
  );
}

export function preferredProfileFor(
  input: string,
  candidates: readonly ConversionProfile[],
): ConversionProfile | null {
  const videoElementaryOutputs = new Set(["h264", "hevc", "m2v", "m4v"]);
  const exact = candidates.filter((profile) => profile.input === input);
  const inputCategory = formatById(input)?.category;
  const sameCategory = inputCategory
    ? exact.filter(
        (profile) => formatById(profile.output)?.category === inputCategory,
      )
    : [];
  const preferredSameCategory =
    inputCategory === "video"
      ? sameCategory.filter(
          (profile) => !videoElementaryOutputs.has(profile.output),
        )
      : sameCategory;
  return (
    preferredSameCategory.find((profile) => profile.route === "stream-copy") ??
    preferredSameCategory[0] ??
    sameCategory.find((profile) => profile.route === "stream-copy") ??
    sameCategory[0] ??
    exact.find((profile) => profile.route === "stream-copy") ??
    exact[0] ??
    candidates[0] ??
    null
  );
}
