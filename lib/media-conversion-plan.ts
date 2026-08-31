import type { ConversionProfile } from "./capability-registry";
import type {
  MediaSourceInspection,
  SourceStreamInspection,
} from "./media-source-inspection";
import {
  audioCodecForProfile,
  audioCompressionForCodec,
  type AudioConversionOptions,
  type VideoConversionOptions,
} from "./media-conversion-options.ts";

export type MediaPlanAction = "copy" | "re-encode" | "exclude" | "reject";

export interface MediaStreamPlan {
  streamIndex: number;
  mediaType: SourceStreamInspection["mediaType"];
  codec: string;
  action: MediaPlanAction;
  detail: string;
}

export interface MediaConversionPlan {
  streams: readonly MediaStreamPlan[];
  blockingReasons: readonly string[];
  metadataSummary: string;
}

const AUDIO_EXTRACTION_CODECS: Readonly<Record<string, string>> = {
  m4a: "AAC",
  mp3: "MP3",
  aac: "AAC",
  ogg: "Vorbis",
  opus: "Opus",
  amr: "AMR-NB",
};

const VIDEO_ELEMENTARY_OUTPUTS = new Set(["h264", "hevc", "m2v", "m4v"]);
const LOSSLESS_AUDIO_OUTPUTS = new Set(["wav", "aiff", "flac", "alac"]);

function normalizedCodec(codec: string): string {
  const value = codec.toLowerCase();
  if (value.includes("h.264") || value.includes("avc")) return "H.264";
  if (value.includes("hevc") || value.includes("h.265")) return "HEVC";
  if (value.includes("mpeg-4 part 2")) return "MPEG-4 Part 2";
  if (value.includes("mpeg-2")) return "MPEG-2 Video";
  if (value.includes("av1")) return "AV1";
  if (value.includes("vp9")) return "VP9";
  if (value.includes("vp8")) return "VP8";
  if (value.includes("theora")) return "Theora";
  if (value.includes("amr-nb")) return "AMR-NB";
  if (value.includes("amr-wb")) return "AMR-WB";
  if (value.includes("aac")) return "AAC";
  if (value.includes("mp3") || value.includes("layer iii")) return "MP3";
  if (value.includes("opus")) return "Opus";
  if (value.includes("vorbis")) return "Vorbis";
  if (value.includes("flac")) return "FLAC";
  if (value.includes("alac")) return "ALAC";
  if (value.includes("pcm")) return "PCM";
  if (value.includes("windows media audio 1")) return "WMA1";
  if (value.includes("windows media audio 2")) return "WMA2";
  if (value.includes("subrip")) return "SubRip";
  if (value.includes("webvtt")) return "WebVTT";
  if (value.includes("ass subtitle")) return "ASS";
  if (value.includes("ssa subtitle")) return "SSA";
  return codec;
}

function fallbackStream(
  inspection: MediaSourceInspection,
): SourceStreamInspection {
  return {
    mediaType: inspection.mediaType,
    codec: inspection.codec,
    durationSeconds: inspection.durationSeconds,
    bitrateBps: inspection.bitrateBps,
    sampleRateHz: inspection.sampleRateHz,
    channels: inspection.channels,
    channelLayout: inspection.channelLayout,
    bitsPerSample: inspection.bitsPerSample,
    width: inspection.width ?? null,
    height: inspection.height ?? null,
    frameRate: inspection.frameRate ?? null,
  };
}

function sourceStreams(
  inspection: MediaSourceInspection,
): readonly SourceStreamInspection[] {
  return inspection.streams?.length
    ? inspection.streams
    : [fallbackStream(inspection)];
}

function planItem(
  stream: SourceStreamInspection,
  streamIndex: number,
  action: MediaPlanAction,
  detail: string,
): MediaStreamPlan {
  return {
    streamIndex,
    mediaType: stream.mediaType,
    codec: stream.codec,
    action,
    detail,
  };
}

function metadataSummary(inspection: MediaSourceInspection): string {
  if (inspection.metadataSignals.length === 0) {
    return "No metadata signals were found by the bounded source scan. The engine still validates complete stream and container metadata during conversion.";
  }
  return `Detected ${inspection.metadataSignals.join(", ")}. Exact tag, chapter, artwork, attachment, language, and container handling follows the selected destination limitations below.`;
}

function mkvCompatible(stream: SourceStreamInspection): boolean {
  const codec = normalizedCodec(stream.codec);
  if (stream.mediaType === "video") {
    return [
      "H.264",
      "HEVC",
      "MPEG-4 Part 2",
      "MPEG-2 Video",
      "VP8",
      "VP9",
      "AV1",
      "Theora",
    ].includes(codec);
  }
  if (stream.mediaType === "audio") {
    return [
      "AAC",
      "MP3",
      "Opus",
      "Vorbis",
      "FLAC",
      "ALAC",
      "PCM",
      "WMA1",
      "WMA2",
      "AMR-NB",
    ].includes(codec);
  }
  return ["SubRip", "ASS", "SSA", "WebVTT"].includes(codec);
}

function containerCodecCompatible(
  profile: ConversionProfile,
  stream: SourceStreamInspection,
): boolean {
  const codec = normalizedCodec(stream.codec);
  if (profile.output === "mkv") return mkvCompatible(stream);
  if (stream.mediaType === "subtitle") return false;
  if (profile.output === "mpeg-ts" || profile.output === "mov") {
    return stream.mediaType === "video"
      ? codec === "H.264" || codec === "HEVC"
      : codec === "AAC";
  }
  if (profile.output === "3gp" || profile.output === "flv") {
    return stream.mediaType === "video" ? codec === "H.264" : codec === "AAC";
  }
  if (profile.output === "mp4") {
    if (profile.input === "avi") {
      return stream.mediaType === "video"
        ? codec === "MPEG-4 Part 2"
        : codec === "MP3";
    }
    return stream.mediaType === "video"
      ? codec === "H.264" || codec === "HEVC"
      : codec === "AAC";
  }
  return false;
}

function planAudioExtraction(
  profile: ConversionProfile,
  streams: readonly SourceStreamInspection[],
): readonly MediaStreamPlan[] {
  const requiredCodec = AUDIO_EXTRACTION_CODECS[profile.output];
  if (profile.output === "m4a") {
    return streams.map((stream, index) => {
      if (stream.mediaType !== "audio") {
        return planItem(
          stream,
          index,
          "exclude",
          "The audio-only M4A destination excludes video and subtitle streams.",
        );
      }
      const compatible = normalizedCodec(stream.codec) === requiredCodec;
      return planItem(
        stream,
        index,
        compatible ? "copy" : "reject",
        compatible
          ? "This AAC audio stream is copied without decoding or re-encoding."
          : "M4A stream copy accepts AAC audio only; an incompatible audio stream makes the fixed profile reject the conversion.",
      );
    });
  }
  let selected = false;
  const planned = streams.map((stream, index) => {
    const matches =
      stream.mediaType === "audio" &&
      normalizedCodec(stream.codec) === requiredCodec;
    if (!selected && matches) {
      selected = true;
      return planItem(
        stream,
        index,
        "copy",
        `The first compatible ${requiredCodec} audio stream is extracted without decoding or re-encoding.`,
      );
    }
    return planItem(
      stream,
      index,
      "exclude",
      stream.mediaType === "audio"
        ? `Only the first compatible ${requiredCodec} audio stream is extracted.`
        : "This audio-only destination cannot include the source stream.",
    );
  });
  if (!selected) {
    const firstAudio = planned.findIndex((stream) => stream.mediaType === "audio");
    if (firstAudio >= 0) {
      const stream = streams[firstAudio];
      planned[firstAudio] = planItem(
        stream,
        firstAudio,
        "reject",
        `No ${requiredCodec} audio stream was found; this lossless extraction profile rejects the source rather than transcoding another codec implicitly.`,
      );
    }
  }
  return planned;
}

function planVideoOnlyCopy(
  profile: ConversionProfile,
  streams: readonly SourceStreamInspection[],
): readonly MediaStreamPlan[] {
  const requiredCodec =
    profile.output === "h264"
      ? "H.264"
      : profile.output === "hevc"
        ? "HEVC"
        : profile.output === "m2v"
          ? "MPEG-2 Video"
          : "MPEG-4 Part 2";
  let selected = false;
  return streams.map((stream, index) => {
    if (!selected && stream.mediaType === "video") {
      selected = true;
      const compatible = normalizedCodec(stream.codec) === requiredCodec;
      return planItem(
        stream,
        index,
        compatible ? "copy" : "reject",
        compatible
          ? `The first video stream is copied losslessly as ${requiredCodec}.`
          : `The first video stream is not ${requiredCodec}; this fixed stream-copy profile will reject the conversion rather than rename or re-encode it implicitly.`,
      );
    }
    return planItem(
      stream,
      index,
      "exclude",
      "This video-only destination includes only the first non-attached video stream.",
    );
  });
}

function planContainerCopy(
  profile: ConversionProfile,
  streams: readonly SourceStreamInspection[],
): readonly MediaStreamPlan[] {
  let firstVideoSeen = false;
  let firstAudioSeen = false;
  return streams.map((stream, index) => {
    if (profile.output === "flv") {
      if (stream.mediaType === "video") {
        if (firstVideoSeen) {
          return planItem(stream, index, "exclude", "FLV includes only the first video stream.");
        }
        firstVideoSeen = true;
      } else if (stream.mediaType === "audio") {
        if (firstAudioSeen) {
          return planItem(stream, index, "exclude", "FLV includes only the first audio stream.");
        }
        firstAudioSeen = true;
      }
    }
    if (stream.mediaType === "subtitle" && profile.output !== "mkv") {
      return planItem(
        stream,
        index,
        "exclude",
        `The ${profile.output.toUpperCase()} destination does not preserve this subtitle stream.`,
      );
    }
    const compatible = containerCodecCompatible(profile, stream);
    return planItem(
      stream,
      index,
      compatible ? "copy" : "reject",
      compatible
        ? "The compressed stream is copied without decoding or re-encoding."
        : "This codec is outside the destination's certified stream-copy set; the worker will reject the conversion instead of silently transcoding or renaming it.",
    );
  });
}

function planAv1WebmCopy(
  streams: readonly SourceStreamInspection[],
): readonly MediaStreamPlan[] {
  let firstVideoSeen = false;
  return streams.map((stream, index) => {
    const codec = normalizedCodec(stream.codec);
    if (stream.mediaType === "video" && !firstVideoSeen) {
      firstVideoSeen = true;
      if (codec !== "AV1") {
        return planItem(
          stream,
          index,
          "reject",
          "The first video stream is not AV1; this fixed copy profile rejects the conversion even if a later AV1 stream exists.",
        );
      }
    }
    const compatible =
      (stream.mediaType === "video" && codec === "AV1") ||
      (stream.mediaType === "audio" && (codec === "Opus" || codec === "Vorbis"));
    return planItem(
      stream,
      index,
      compatible ? "copy" : "exclude",
      compatible
        ? "This stream is copied without decoding or re-encoding into WebM."
        : "Only AV1 video and compatible Opus or Vorbis audio are included by this fixed WebM copy profile.",
    );
  });
}

function planStreamCopy(
  profile: ConversionProfile,
  streams: readonly SourceStreamInspection[],
): readonly MediaStreamPlan[] {
  if (profile.output === "webm-av1") return planAv1WebmCopy(streams);
  if (VIDEO_ELEMENTARY_OUTPUTS.has(profile.output)) {
    return planVideoOnlyCopy(profile, streams);
  }
  if (profile.id === "m2v-to-mpeg-ts" || profile.id === "m4v-to-mp4") {
    return planVideoOnlyCopy(
      {
        ...profile,
        output: profile.id === "m2v-to-mpeg-ts" ? "m2v" : "m4v",
      },
      streams,
    );
  }
  if (AUDIO_EXTRACTION_CODECS[profile.output]) {
    return planAudioExtraction(profile, streams);
  }
  return planContainerCopy(profile, streams);
}

function planAudioReencode(
  profile: ConversionProfile,
  streams: readonly SourceStreamInspection[],
  audioOptions?: AudioConversionOptions,
): readonly MediaStreamPlan[] {
  let selected = false;
  return streams.map((stream, index) => {
    if (!selected && stream.mediaType === "audio") {
      selected = true;
      const profileCodec = audioCodecForProfile(profile);
      const customAudio =
        audioOptions &&
        (audioOptions.codec !== "automatic" ||
          audioOptions.compression !== "automatic" ||
          audioOptions.bitRateBps !== 0 ||
          audioOptions.sampleRateHz !== 0 ||
          audioOptions.channels !== 0 ||
          audioOptions.quality !== "automatic");
      const selectedAudioSettings = customAudio
        ? [
            audioOptions.codec === "automatic"
              ? `automatic codec (${profileCodec ?? profile.output})`
              : audioOptions.codec.toUpperCase(),
            audioOptions.compression === "automatic"
              ? `automatic ${audioCompressionForCodec(profileCodec ?? "automatic") ?? "compression"}`
              : audioOptions.compression,
            audioOptions.bitRateBps
              ? `${audioOptions.bitRateBps / 1_000} kb/s`
              : "automatic bitrate",
            audioOptions.sampleRateHz
              ? `${audioOptions.sampleRateHz.toLocaleString("en-US")} Hz`
              : "automatic sample rate",
            audioOptions.channels === 1
              ? "mono"
              : audioOptions.channels === 2
                ? "stereo"
                : "automatic channel layout",
            audioOptions.quality === "automatic"
              ? "automatic quality"
              : `${audioOptions.quality} quality`,
          ].join(", ")
        : null;
      const fidelity = LOSSLESS_AUDIO_OUTPUTS.has(profile.output)
        ? selectedAudioSettings
          ? `encodes the decoded signal with lossless compression using ${selectedAudioSettings}`
          : "losslessly encodes the decoded signal"
        : selectedAudioSettings
          ? `encodes the decoded signal using ${selectedAudioSettings}`
          : "encodes the decoded signal with the certified automatic lossy settings";
      return planItem(
        stream,
        index,
        "re-encode",
        `The first audio stream is decoded and ${fidelity}; source compression losses cannot be restored.`,
      );
    }
    return planItem(
      stream,
      index,
      "exclude",
      "This fixed audio profile converts only the first audio stream.",
    );
  });
}

function planVideoReencode(
  profile: ConversionProfile,
  streams: readonly SourceStreamInspection[],
  videoOptions?: VideoConversionOptions,
): readonly MediaStreamPlan[] {
  let videoSelected = false;
  let audioSelected = false;
  const preservesOgvAudio = profile.input === "ogv";
  return streams.map((stream, index) => {
    if (!videoSelected && stream.mediaType === "video") {
      videoSelected = true;
      const defaultCodec = profile.output.includes("vp9")
        ? "VP9"
        : profile.output.includes("webm")
          ? "VP8"
          : "MPEG-4 Part 2";
      const codec =
        !videoOptions || videoOptions.codec === "automatic"
          ? defaultCodec
          : videoOptions.codec === "vp8"
            ? "VP8"
            : videoOptions.codec === "vp9"
              ? "VP9"
              : "MPEG-4 Part 2";
      const webm = profile.output.includes("webm");
      const widthPolicy = videoOptions?.maxWidth
        ? `at most ${videoOptions.maxWidth}px wide without upscaling`
        : webm
          ? "the certified 640px no-upscale width cap"
          : "the source dimensions";
      const bitrate = videoOptions?.bitRateBps
        ? `${videoOptions.bitRateBps / 1_000} kb/s`
        : webm
          ? "the certified 600 kb/s target"
          : "the certified 2,000 kb/s target";
      const frameRate = videoOptions?.frameRateFps
        ? `a ${videoOptions.frameRateFps} fps cap (never frame-rate upconversion)`
        : "the source average frame rate";
      const quality =
        !videoOptions || videoOptions.quality === "automatic"
          ? "the fastest certified automatic quality policy"
          : videoOptions.quality === "smaller"
            ? "the smaller-file quality policy"
            : videoOptions.quality === "balanced"
              ? "the balanced quality policy"
              : "the higher-visual-quality policy";
      return planItem(
        stream,
        index,
        "re-encode",
        `The first video stream is decoded and encoded as ${codec} using ${widthPolicy}, ${bitrate}, ${frameRate}, and ${quality}.`,
      );
    }
    if (
      preservesOgvAudio &&
      !audioSelected &&
      stream.mediaType === "audio" &&
      normalizedCodec(stream.codec) === "Vorbis"
    ) {
      audioSelected = true;
      return planItem(
        stream,
        index,
        "copy",
        "The first Vorbis audio stream is preserved without a second lossy encode.",
      );
    }
    return planItem(
      stream,
      index,
      "exclude",
      preservesOgvAudio && stream.mediaType === "audio"
        ? "Only the first Vorbis audio stream is preserved by this OGV profile."
        : "This fixed video profile excludes audio, subtitles, attachments, data, and additional video streams.",
    );
  });
}

export function planMediaConversion(
  profile: ConversionProfile,
  inspection: MediaSourceInspection,
  audioOptions?: AudioConversionOptions,
  videoOptions?: VideoConversionOptions,
): MediaConversionPlan | null {
  if (
    profile.engine !== "ffmpeg-remux" &&
    profile.engine !== "ffmpeg-audio" &&
    profile.engine !== "ffmpeg-video"
  ) {
    return null;
  }
  const streams = sourceStreams(inspection);
  const plannedStreams =
    profile.route === "stream-copy"
      ? planStreamCopy(profile, streams)
      : profile.engine === "ffmpeg-audio"
        ? planAudioReencode(profile, streams, audioOptions)
        : planVideoReencode(profile, streams, videoOptions);
  const blockingReasons = plannedStreams
    .filter((stream) => stream.action === "reject")
    .map(
      (stream) =>
        `Stream ${stream.streamIndex + 1} (${stream.codec}) is incompatible with this fixed profile.`,
    );
  if (
    profile.route === "stream-copy" &&
    profile.output === "flv" &&
    !streams.some((stream) => stream.mediaType === "video")
  ) {
    blockingReasons.push("FLV stream copy requires a video stream.");
  }
  if (
    profile.route === "stream-copy" &&
    profile.output === "flv" &&
    !streams.some((stream) => stream.mediaType === "audio")
  ) {
    blockingReasons.push("FLV stream copy requires an audio stream.");
  }
  if (
    profile.route === "stream-copy" &&
    (VIDEO_ELEMENTARY_OUTPUTS.has(profile.output) ||
      profile.id === "m2v-to-mpeg-ts" ||
      profile.id === "m4v-to-mp4" ||
      profile.output === "webm-av1") &&
    !streams.some((stream) => stream.mediaType === "video")
  ) {
    blockingReasons.push("This profile requires a video stream.");
  }
  if (
    profile.route === "stream-copy" &&
    AUDIO_EXTRACTION_CODECS[profile.output] &&
    !plannedStreams.some((stream) => stream.action === "copy")
  ) {
    blockingReasons.push(
      `This profile requires ${AUDIO_EXTRACTION_CODECS[profile.output]} audio.`,
    );
  }
  if (
    profile.engine === "ffmpeg-audio" &&
    !streams.some((stream) => stream.mediaType === "audio")
  ) {
    blockingReasons.push("This profile requires an audio stream.");
  }
  if (
    profile.engine === "ffmpeg-video" &&
    !streams.some((stream) => stream.mediaType === "video")
  ) {
    blockingReasons.push("This profile requires a video stream.");
  }
  if (
    profile.engine === "ffmpeg-video" &&
    profile.input === "ogv" &&
    !plannedStreams.some(
      (stream) =>
        stream.mediaType === "audio" && stream.action === "copy",
    )
  ) {
    blockingReasons.push(
      "The certified OGV video profile requires a Vorbis audio stream so audio can be copied without another lossy encode.",
    );
  }
  return {
    streams: plannedStreams,
    blockingReasons: [...new Set(blockingReasons)],
    metadataSummary: metadataSummary(inspection),
  };
}
