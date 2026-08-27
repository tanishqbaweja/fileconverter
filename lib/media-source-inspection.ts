export const MAX_WAV_INSPECTION_BYTES = 256 * 1024;
export const MAX_MP3_INSPECTION_BYTES = 10 + 4_096 + 128;
export const MAX_FLAC_INSPECTION_BYTES = 256 * 1024;
export const MAX_AIFF_INSPECTION_BYTES = 256 * 1024;
export const MAX_AAC_INSPECTION_BYTES = 10 + 32 * 7;
const MAX_OGG_TAIL_BYTES = 66 * 1024;
export const MAX_OGG_INSPECTION_BYTES =
  27 + 255 + 256 + MAX_OGG_TAIL_BYTES;
const MAX_AMR_FRAME_WINDOW_BYTES = 8 * 1024;
export const MAX_AMR_INSPECTION_BYTES = 9 + MAX_AMR_FRAME_WINDOW_BYTES;
export const MAX_ISO_BMFF_INSPECTION_BYTES = 64 * 1024;
export const MAX_ASF_INSPECTION_BYTES = 64 * 1024;

export interface AudioSourceInspection {
  mediaType: "audio";
  container: string;
  codec: string;
  durationSeconds: number | null;
  bitrateBps: number | null;
  sampleRateHz: number | null;
  channels: number | null;
  channelLayout: string | null;
  bitsPerSample: number | null;
  metadataSignals: readonly string[];
  notes: readonly string[];
  inspectedBytes: number;
  maximumInspectionBytes: number;
}

function ascii(view: DataView, offset: number, length: number): string {
  if (offset < 0 || offset + length > view.byteLength) return "";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function channelLayout(channels: number | null): string | null {
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return channels && channels > 0 ? `${channels} channels` : null;
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function safeUint64(view: DataView, offset: number): number | null {
  if (offset + 8 > view.byteLength) return null;
  const value = view.getBigUint64(offset, true);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function wavCodec(format: number, extensibleSubtype: number | null): string {
  const resolved = format === 0xfffe && extensibleSubtype ? extensibleSubtype : format;
  return (
    {
      0x0001: "PCM",
      0x0003: "IEEE floating-point PCM",
      0x0006: "G.711 A-law",
      0x0007: "G.711 μ-law",
      0x0055: "MP3 in WAV",
    } as Record<number, string>
  )[resolved] ?? `WAVE format 0x${resolved.toString(16).padStart(4, "0")}`;
}

async function inspectWav(file: Blob): Promise<AudioSourceInspection> {
  let inspectedBytes = 0;
  const read = async (offset: number, length: number): Promise<DataView> => {
    if (
      offset < 0 ||
      length < 0 ||
      offset + length > file.size ||
      offset + length > MAX_WAV_INSPECTION_BYTES
    ) {
      throw new Error("The WAVE header exceeds the bounded inspection ceiling.");
    }
    const bytes = new Uint8Array(
      await file.slice(offset, offset + length).arrayBuffer(),
    );
    inspectedBytes += bytes.byteLength;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };
  if (file.size < 12) {
    throw new Error("The selected file does not contain a valid RIFF/RF64 WAVE header.");
  }
  const riffView = await read(0, 12);
  if (
    !["RIFF", "RF64"].includes(ascii(riffView, 0, 4)) ||
    ascii(riffView, 8, 4) !== "WAVE"
  ) {
    throw new Error("The selected file does not contain a valid RIFF/RF64 WAVE header.");
  }

  const rf64 = ascii(riffView, 0, 4) === "RF64";
  let formatCode: number | null = null;
  let extensibleSubtype: number | null = null;
  let channels: number | null = null;
  let sampleRateHz: number | null = null;
  let byteRate: number | null = null;
  let bitsPerSample: number | null = null;
  let dataBytes: number | null = null;
  let rf64DataBytes: number | null = null;
  const metadataSignals: string[] = [];
  const notes: string[] = [];

  let chunkCount = 0;
  for (let offset = 12; offset + 8 <= file.size; ) {
    if (offset + 8 > MAX_WAV_INSPECTION_BYTES || chunkCount >= 256) {
      notes.push("The WAVE chunk table exceeded the bounded inspection ceiling.");
      break;
    }
    chunkCount += 1;
    const chunkView = await read(offset, 8);
    const id = ascii(chunkView, 0, 4);
    const size = chunkView.getUint32(4, true);
    const dataOffset = offset + 8;
    if (id === "ds64" && size >= 24) {
      const ds64View = await read(dataOffset, 24);
      rf64DataBytes = safeUint64(ds64View, 8);
    } else if (id === "fmt " && size >= 16) {
      const formatView = await read(dataOffset, Math.min(size, 40));
      formatCode = formatView.getUint16(0, true);
      channels = formatView.getUint16(2, true);
      sampleRateHz = formatView.getUint32(4, true);
      byteRate = formatView.getUint32(8, true);
      bitsPerSample = formatView.getUint16(14, true);
      if (
        formatCode === 0xfffe &&
        size >= 40 &&
        formatView.byteLength >= 26
      ) {
        extensibleSubtype = formatView.getUint16(24, true);
      }
    } else if (id === "data") {
      dataBytes = rf64 && size === 0xffff_ffff ? rf64DataBytes : size;
      break;
    } else if (["LIST", "ID3 ", "id3 ", "bext", "iXML"].includes(id)) {
      metadataSignals.push(id.trim() === "LIST" ? "RIFF LIST metadata" : id.trim());
    }

    const next = dataOffset + size + (size & 1);
    if (next <= offset || next > file.size) break;
    offset = next;
  }

  if (formatCode === null) {
    throw new Error("The bounded WAVE header scan did not find a valid fmt chunk.");
  }
  if (dataBytes === null) {
    notes.push(
      `The data chunk starts beyond the ${MAX_WAV_INSPECTION_BYTES.toLocaleString("en-US")}-byte inspection ceiling; duration is unavailable before conversion.`,
    );
  }
  const durationSeconds =
    dataBytes !== null && byteRate
      ? finitePositive(dataBytes / byteRate)
      : null;

  return {
    mediaType: "audio",
    container: rf64 ? "RF64/WAVE" : "RIFF/WAVE",
    codec: wavCodec(formatCode, extensibleSubtype),
    durationSeconds,
    bitrateBps: byteRate ? finitePositive(byteRate * 8) : null,
    sampleRateHz: finitePositive(sampleRateHz ?? 0),
    channels: finitePositive(channels ?? 0),
    channelLayout: channelLayout(channels),
    bitsPerSample: finitePositive(bitsPerSample ?? 0),
    metadataSignals,
    notes,
    inspectedBytes,
    maximumInspectionBytes: MAX_WAV_INSPECTION_BYTES,
  };
}

const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
] as const;
const MPEG2_LAYER3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
] as const;
const MPEG1_SAMPLE_RATES = [44_100, 48_000, 32_000] as const;

function synchsafeSize(bytes: Uint8Array): number | null {
  if (bytes.length < 10 || bytes.slice(6, 10).some((value) => value > 0x7f)) {
    return null;
  }
  return (
    (bytes[6] << 21) |
    (bytes[7] << 14) |
    (bytes[8] << 7) |
    bytes[9]
  );
}

interface Mp3FrameHeader {
  offset: number;
  version: "MPEG-1" | "MPEG-2" | "MPEG-2.5";
  bitrateBps: number;
  sampleRateHz: number;
  channels: number;
  samplesPerFrame: number;
  hasCrc: boolean;
  frameLength: number;
}

function findMp3Frame(bytes: Uint8Array): Mp3FrameHeader | null {
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    const header =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0;
    if ((header >>> 21) !== 0x7ff) continue;
    const versionBits = (header >>> 19) & 0x3;
    const layerBits = (header >>> 17) & 0x3;
    const bitrateIndex = (header >>> 12) & 0xf;
    const sampleRateIndex = (header >>> 10) & 0x3;
    if (
      versionBits === 1 ||
      layerBits !== 1 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      sampleRateIndex === 3
    ) {
      continue;
    }
    const mpeg1 = versionBits === 3;
    const sampleDivisor = mpeg1 ? 1 : versionBits === 2 ? 2 : 4;
    const bitrateKbps = (mpeg1
      ? MPEG1_LAYER3_BITRATES
      : MPEG2_LAYER3_BITRATES)[bitrateIndex];
    const sampleRateHz = MPEG1_SAMPLE_RATES[sampleRateIndex] / sampleDivisor;
    const padding = (header >>> 9) & 1;
    return {
      offset,
      version: mpeg1 ? "MPEG-1" : versionBits === 2 ? "MPEG-2" : "MPEG-2.5",
      bitrateBps: bitrateKbps * 1_000,
      sampleRateHz,
      channels: ((header >>> 6) & 0x3) === 3 ? 1 : 2,
      samplesPerFrame: mpeg1 ? 1_152 : 576,
      hasCrc: ((header >>> 16) & 1) === 0,
      frameLength:
        Math.floor(((mpeg1 ? 144 : 72) * bitrateKbps * 1_000) / sampleRateHz) +
        padding,
    };
  }
  return null;
}

function mp3FrameCount(
  view: DataView,
  header: Mp3FrameHeader,
): { frames: number; signal: string; variableBitrate: boolean } | null {
  const sideInfo =
    header.version === "MPEG-1"
      ? header.channels === 1
        ? 17
        : 32
      : header.channels === 1
        ? 9
        : 17;
  const xingOffset = header.offset + 4 + (header.hasCrc ? 2 : 0) + sideInfo;
  const marker = ascii(view, xingOffset, 4);
  if (["Xing", "Info"].includes(marker) && xingOffset + 12 <= view.byteLength) {
    const flags = view.getUint32(xingOffset + 4, false);
    if ((flags & 1) !== 0) {
      return {
        frames: view.getUint32(xingOffset + 8, false),
        signal: `${marker} frame index`,
        variableBitrate: marker === "Xing",
      };
    }
  }
  const vbriOffset = header.offset + 4 + 32;
  if (ascii(view, vbriOffset, 4) === "VBRI" && vbriOffset + 18 <= view.byteLength) {
    return {
      frames: view.getUint32(vbriOffset + 14, false),
      signal: "VBRI frame index",
      variableBitrate: true,
    };
  }
  return null;
}

async function inspectMp3(file: Blob): Promise<AudioSourceInspection> {
  const id3Header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  let inspectedBytes = id3Header.byteLength;
  let audioOffset = 0;
  const metadataSignals: string[] = [];
  const notes: string[] = [];
  if (
    id3Header.byteLength === 10 &&
    String.fromCharCode(...id3Header.slice(0, 3)) === "ID3"
  ) {
    const tagBytes = synchsafeSize(id3Header);
    if (tagBytes === null) throw new Error("The MP3 ID3v2 size is malformed.");
    audioOffset = 10 + tagBytes + ((id3Header[5] & 0x10) !== 0 ? 10 : 0);
    if (audioOffset >= file.size) {
      throw new Error("The MP3 ID3v2 tag extends beyond the selected file.");
    }
    metadataSignals.push(`ID3v2.${id3Header[3]} tag`);
  }

  const frameBytes = new Uint8Array(
    await file.slice(audioOffset, audioOffset + 4_096).arrayBuffer(),
  );
  inspectedBytes += frameBytes.byteLength;
  const frameView = new DataView(
    frameBytes.buffer,
    frameBytes.byteOffset,
    frameBytes.byteLength,
  );
  const header = findMp3Frame(frameBytes);
  if (!header) {
    throw new Error("The bounded MP3 scan did not find a valid Layer III frame header.");
  }
  const nextFrameOffset = header.offset + header.frameLength;
  if (audioOffset + nextFrameOffset + 4 <= file.size) {
    const nextHeader = findMp3Frame(
      frameBytes.subarray(nextFrameOffset, nextFrameOffset + 4),
    );
    if (
      !nextHeader ||
      nextHeader.offset !== 0 ||
      nextHeader.version !== header.version ||
      nextHeader.sampleRateHz !== header.sampleRateHz ||
      nextHeader.channels !== header.channels
    ) {
      throw new Error("The MP3 frame sequence is not structurally consistent.");
    }
  }

  let hasId3v1 = false;
  if (file.size >= 128) {
    const tail = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
    inspectedBytes += tail.byteLength;
    hasId3v1 = String.fromCharCode(...tail.slice(0, 3)) === "TAG";
    if (hasId3v1) metadataSignals.push("ID3v1 tag");
  }

  const indexedFrames = mp3FrameCount(frameView, header);
  let durationSeconds: number | null = null;
  let bitrateBps = header.bitrateBps;
  if (indexedFrames?.frames) {
    durationSeconds = finitePositive(
      (indexedFrames.frames * header.samplesPerFrame) / header.sampleRateHz,
    );
    metadataSignals.push(indexedFrames.signal);
    const audioBytes = Math.max(
      0,
      file.size - audioOffset - (hasId3v1 ? 128 : 0),
    );
    if (durationSeconds && indexedFrames.variableBitrate) {
      bitrateBps = Math.round((audioBytes * 8) / durationSeconds);
    }
  } else {
    const audioBytes = Math.max(
      0,
      file.size - audioOffset - (hasId3v1 ? 128 : 0),
    );
    durationSeconds = finitePositive((audioBytes * 8) / header.bitrateBps);
    notes.push("Duration is estimated from the first frame bitrate because no Xing/VBRI frame index was found.");
  }

  return {
    mediaType: "audio",
    container: "MPEG audio",
    codec: `${header.version} Layer III (MP3)`,
    durationSeconds,
    bitrateBps: finitePositive(bitrateBps),
    sampleRateHz: header.sampleRateHz,
    channels: header.channels,
    channelLayout: channelLayout(header.channels),
    bitsPerSample: null,
    metadataSignals,
    notes,
    inspectedBytes,
    maximumInspectionBytes: MAX_MP3_INSPECTION_BYTES,
  };
}

async function inspectFlac(file: Blob): Promise<AudioSourceInspection> {
  let inspectedBytes = 0;
  const read = async (offset: number, length: number): Promise<DataView> => {
    if (
      offset < 0 ||
      length < 0 ||
      offset + length > file.size ||
      offset + length > MAX_FLAC_INSPECTION_BYTES
    ) {
      throw new Error("The FLAC metadata exceeds the bounded inspection ceiling.");
    }
    const bytes = new Uint8Array(
      await file.slice(offset, offset + length).arrayBuffer(),
    );
    inspectedBytes += bytes.byteLength;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };
  if (file.size < 42) throw new Error("The selected file is too small to be FLAC.");
  const signature = await read(0, 4);
  if (ascii(signature, 0, 4) !== "fLaC") {
    throw new Error("The selected file does not contain a valid FLAC signature.");
  }

  let offset = 4;
  let sampleRateHz: number | null = null;
  let channels: number | null = null;
  let bitsPerSample: number | null = null;
  let totalSamples: number | null = null;
  const metadataSignals: string[] = [];
  const notes: string[] = [];
  for (let blockIndex = 0; blockIndex < 64; blockIndex += 1) {
    if (offset + 4 > file.size || offset + 4 > MAX_FLAC_INSPECTION_BYTES) {
      notes.push("The FLAC metadata table exceeded the bounded inspection ceiling.");
      break;
    }
    const header = await read(offset, 4);
    const last = (header.getUint8(0) & 0x80) !== 0;
    const type = header.getUint8(0) & 0x7f;
    const length =
      (header.getUint8(1) << 16) |
      (header.getUint8(2) << 8) |
      header.getUint8(3);
    const dataOffset = offset + 4;
    if (blockIndex === 0 && (type !== 0 || length !== 34)) {
      throw new Error("The first FLAC metadata block is not STREAMINFO.");
    }
    if (dataOffset + length > file.size) {
      throw new Error("A FLAC metadata block extends beyond the selected file.");
    }
    if (type === 0) {
      const streamInfo = await read(dataOffset, 34);
      sampleRateHz =
        (streamInfo.getUint8(10) << 12) |
        (streamInfo.getUint8(11) << 4) |
        (streamInfo.getUint8(12) >>> 4);
      channels = ((streamInfo.getUint8(12) & 0x0e) >>> 1) + 1;
      bitsPerSample =
        (((streamInfo.getUint8(12) & 1) << 4) |
          (streamInfo.getUint8(13) >>> 4)) +
        1;
      totalSamples =
        (streamInfo.getUint8(13) & 0x0f) * 0x1_0000_0000 +
        streamInfo.getUint32(14, false);
    } else {
      const signal = (
        {
          2: "Application metadata",
          3: "Seek table",
          4: "Vorbis comments",
          5: "Cue sheet",
          6: "Embedded picture",
        } as Record<number, string>
      )[type];
      if (signal) metadataSignals.push(signal);
    }
    offset = dataOffset + length;
    if (last) break;
  }
  if (!sampleRateHz || !channels || !bitsPerSample || !totalSamples) {
    throw new Error("The FLAC STREAMINFO block is incomplete.");
  }
  const durationSeconds = finitePositive(totalSamples / sampleRateHz);
  notes.push("Bitrate is the average file bitrate, including bounded FLAC metadata.");
  return {
    mediaType: "audio",
    container: "Native FLAC",
    codec: "FLAC",
    durationSeconds,
    bitrateBps: durationSeconds
      ? finitePositive(Math.round((file.size * 8) / durationSeconds))
      : null,
    sampleRateHz,
    channels,
    channelLayout: channelLayout(channels),
    bitsPerSample,
    metadataSignals,
    notes,
    inspectedBytes,
    maximumInspectionBytes: MAX_FLAC_INSPECTION_BYTES,
  };
}

function readExtended80(view: DataView, offset: number): number | null {
  if (offset + 10 > view.byteLength) return null;
  const sign = (view.getUint8(offset) & 0x80) !== 0 ? -1 : 1;
  const exponent =
    ((view.getUint8(offset) & 0x7f) << 8) | view.getUint8(offset + 1);
  const mantissa = view.getBigUint64(offset + 2, false);
  if (exponent === 0 && mantissa === BigInt(0)) return 0;
  if (exponent === 0x7fff) return null;
  return (
    sign *
    (Number(mantissa) / 2 ** 63) *
    2 ** (exponent - 16_383)
  );
}

function aiffCodec(container: string, compression: string | null): string {
  if (container === "AIFF") return "PCM (big-endian)";
  return (
    {
      NONE: "PCM (big-endian)",
      sowt: "PCM (little-endian)",
      fl32: "IEEE 32-bit float PCM",
      fl64: "IEEE 64-bit float PCM",
      alaw: "G.711 A-law",
      ulaw: "G.711 μ-law",
      ima4: "IMA ADPCM",
    } as Record<string, string>
  )[compression ?? ""] ?? `AIFC codec ${compression ?? "unknown"}`;
}

async function inspectAiff(file: Blob): Promise<AudioSourceInspection> {
  let inspectedBytes = 0;
  const read = async (offset: number, length: number): Promise<DataView> => {
    if (
      offset < 0 ||
      length < 0 ||
      offset + length > file.size ||
      offset + length > MAX_AIFF_INSPECTION_BYTES
    ) {
      throw new Error("The AIFF chunk table exceeds the bounded inspection ceiling.");
    }
    const bytes = new Uint8Array(
      await file.slice(offset, offset + length).arrayBuffer(),
    );
    inspectedBytes += bytes.byteLength;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };
  if (file.size < 12) throw new Error("The selected file is too small to be AIFF.");
  const form = await read(0, 12);
  const container = ascii(form, 8, 4);
  if (ascii(form, 0, 4) !== "FORM" || !["AIFF", "AIFC"].includes(container)) {
    throw new Error("The selected file does not contain a valid AIFF/AIFC header.");
  }

  let channels: number | null = null;
  let sampleFrames: number | null = null;
  let bitsPerSample: number | null = null;
  let sampleRateHz: number | null = null;
  let compression: string | null = null;
  const metadataSignals: string[] = [];
  const notes: string[] = [];
  let chunkCount = 0;
  for (let offset = 12; offset + 8 <= file.size; ) {
    if (offset + 8 > MAX_AIFF_INSPECTION_BYTES || chunkCount >= 256) {
      notes.push("The AIFF chunk table exceeded the bounded inspection ceiling.");
      break;
    }
    chunkCount += 1;
    const header = await read(offset, 8);
    const id = ascii(header, 0, 4);
    const length = header.getUint32(4, false);
    const dataOffset = offset + 8;
    if (dataOffset + length > file.size) break;
    if (id === "COMM" && length >= 18) {
      const comm = await read(dataOffset, Math.min(length, 22));
      channels = comm.getUint16(0, false);
      sampleFrames = comm.getUint32(2, false);
      bitsPerSample = comm.getUint16(6, false);
      const decodedRate = readExtended80(comm, 8);
      sampleRateHz = decodedRate ? Math.round(decodedRate) : null;
      if (container === "AIFC" && comm.byteLength >= 22) {
        compression = ascii(comm, 18, 4);
      }
    } else if (["NAME", "AUTH", "ANNO", "(c) ", "ID3 "].includes(id)) {
      metadataSignals.push(
        ({ NAME: "Name", AUTH: "Author", ANNO: "Annotation", "(c) ": "Copyright", "ID3 ": "ID3 tag" } as Record<string, string>)[id],
      );
    } else if (id === "SSND") {
      break;
    }
    const next = dataOffset + length + (length & 1);
    if (next <= offset || next > file.size) break;
    offset = next;
  }
  if (!channels || !sampleFrames || !bitsPerSample || !sampleRateHz) {
    throw new Error("The bounded AIFF scan did not find a complete COMM chunk.");
  }
  const durationSeconds = finitePositive(sampleFrames / sampleRateHz);
  return {
    mediaType: "audio",
    container,
    codec: aiffCodec(container, compression),
    durationSeconds,
    bitrateBps: finitePositive(sampleRateHz * channels * bitsPerSample),
    sampleRateHz,
    channels,
    channelLayout: channelLayout(channels),
    bitsPerSample,
    metadataSignals,
    notes,
    inspectedBytes,
    maximumInspectionBytes: MAX_AIFF_INSPECTION_BYTES,
  };
}

const AAC_SAMPLE_RATES = [
  96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050,
  16_000, 12_000, 11_025, 8_000, 7_350,
] as const;

interface AdtsHeader {
  codec: string;
  sampleRateHz: number;
  channels: number | null;
  frameLength: number;
  samples: number;
}

function parseAdtsHeader(view: DataView): AdtsHeader | null {
  if (
    view.byteLength < 7 ||
    view.getUint8(0) !== 0xff ||
    (view.getUint8(1) & 0xf6) !== 0xf0
  ) {
    return null;
  }
  const profile = ((view.getUint8(2) >>> 6) & 0x3) + 1;
  const sampleRateIndex = (view.getUint8(2) >>> 2) & 0x0f;
  const sampleRateHz = AAC_SAMPLE_RATES[sampleRateIndex];
  if (!sampleRateHz) return null;
  const channelConfig =
    ((view.getUint8(2) & 1) << 2) | (view.getUint8(3) >>> 6);
  const frameLength =
    ((view.getUint8(3) & 3) << 11) |
    (view.getUint8(4) << 3) |
    (view.getUint8(5) >>> 5);
  const headerLength = (view.getUint8(1) & 1) !== 0 ? 7 : 9;
  if (frameLength < headerLength) return null;
  return {
    codec: `AAC ${(["Main", "LC", "SSR", "LTP"] as const)[profile - 1]}`,
    sampleRateHz,
    channels: channelConfig || null,
    frameLength,
    samples: 1_024 * ((view.getUint8(6) & 3) + 1),
  };
}

async function inspectAac(file: Blob): Promise<AudioSourceInspection> {
  const firstBytes = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  let inspectedBytes = firstBytes.byteLength;
  let audioOffset = 0;
  const metadataSignals: string[] = [];
  if (
    firstBytes.byteLength === 10 &&
    String.fromCharCode(...firstBytes.slice(0, 3)) === "ID3"
  ) {
    const tagBytes = synchsafeSize(firstBytes);
    if (tagBytes === null) throw new Error("The AAC ID3v2 size is malformed.");
    audioOffset = 10 + tagBytes + ((firstBytes[5] & 0x10) !== 0 ? 10 : 0);
    metadataSignals.push(`ID3v2.${firstBytes[3]} tag`);
  }

  let offset = audioOffset;
  let firstHeader: AdtsHeader | null = null;
  let frameBytes = 0;
  let frameSamples = 0;
  let frames = 0;
  for (; frames < 32 && offset + 7 <= file.size; frames += 1) {
    const bytes = new Uint8Array(await file.slice(offset, offset + 7).arrayBuffer());
    inspectedBytes += bytes.byteLength;
    const header = parseAdtsHeader(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
    if (!header) {
      if (frames < 2) throw new Error("The AAC frame sequence is not valid ADTS.");
      break;
    }
    if (
      firstHeader &&
      (header.sampleRateHz !== firstHeader.sampleRateHz ||
        header.channels !== firstHeader.channels ||
        header.codec !== firstHeader.codec)
    ) {
      throw new Error("The AAC ADTS frame configuration changes inside the bounded scan.");
    }
    firstHeader ??= header;
    frameBytes += header.frameLength;
    frameSamples += header.samples;
    offset += header.frameLength;
  }
  if (!firstHeader || frames < 2 || frameBytes <= 0 || frameSamples <= 0) {
    throw new Error("The bounded AAC scan did not find two consistent ADTS frames.");
  }
  const averageFrameBytes = frameBytes / frames;
  const averageFrameSamples = frameSamples / frames;
  const estimatedFrames = (file.size - audioOffset) / averageFrameBytes;
  const durationSeconds = finitePositive(
    (estimatedFrames * averageFrameSamples) / firstHeader.sampleRateHz,
  );
  return {
    mediaType: "audio",
    container: "ADTS",
    codec: firstHeader.codec,
    durationSeconds,
    bitrateBps: durationSeconds
      ? finitePositive(Math.round(((file.size - audioOffset) * 8) / durationSeconds))
      : null,
    sampleRateHz: firstHeader.sampleRateHz,
    channels: firstHeader.channels,
    channelLayout: channelLayout(firstHeader.channels),
    bitsPerSample: null,
    metadataSignals,
    notes: ["Duration and bitrate are estimated from up to 32 bounded ADTS frame headers."],
    inspectedBytes,
    maximumInspectionBytes: MAX_AAC_INSPECTION_BYTES,
  };
}

interface OggPageHeader {
  granule: number | null;
  serial: number;
  segmentBytes: Uint8Array;
  bodyOffset: number;
}

async function readFirstOggPage(
  file: Blob,
): Promise<{ page: OggPageHeader; inspectedBytes: number }> {
  if (file.size < 28) throw new Error("The selected file is too small to be Ogg.");
  const fixedBytes = new Uint8Array(await file.slice(0, 27).arrayBuffer());
  const fixed = new DataView(
    fixedBytes.buffer,
    fixedBytes.byteOffset,
    fixedBytes.byteLength,
  );
  if (ascii(fixed, 0, 4) !== "OggS" || fixed.getUint8(4) !== 0) {
    throw new Error("The selected file does not contain a valid Ogg page header.");
  }
  const segmentCount = fixed.getUint8(26);
  const segmentBytes = new Uint8Array(
    await file.slice(27, 27 + segmentCount).arrayBuffer(),
  );
  return {
    page: {
      granule: safeUint64(fixed, 6),
      serial: fixed.getUint32(14, true),
      segmentBytes,
      bodyOffset: 27 + segmentCount,
    },
    inspectedBytes: fixedBytes.byteLength + segmentBytes.byteLength,
  };
}

function firstOggPacketLength(segments: Uint8Array): number | null {
  let length = 0;
  for (const segment of segments) {
    length += segment;
    if (segment < 255) return length;
  }
  return null;
}

async function lastOggGranule(
  file: Blob,
  serial: number,
): Promise<{ granule: number | null; inspectedBytes: number }> {
  const length = Math.min(file.size, MAX_OGG_TAIL_BYTES);
  const start = file.size - length;
  const bytes = new Uint8Array(await file.slice(start).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = bytes.byteLength - 27; index >= 0; index -= 1) {
    if (
      bytes[index] !== 0x4f ||
      bytes[index + 1] !== 0x67 ||
      bytes[index + 2] !== 0x67 ||
      bytes[index + 3] !== 0x53 ||
      bytes[index + 4] !== 0
    ) {
      continue;
    }
    const segmentCount = bytes[index + 26];
    if (index + 27 + segmentCount > bytes.byteLength) continue;
    if (view.getUint32(index + 14, true) !== serial) continue;
    let payloadBytes = 0;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      payloadBytes += bytes[index + 27 + segment];
    }
    if (index + 27 + segmentCount + payloadBytes > bytes.byteLength) continue;
    return {
      granule: safeUint64(view, index + 6),
      inspectedBytes: bytes.byteLength,
    };
  }
  return { granule: null, inspectedBytes: bytes.byteLength };
}

async function inspectOgg(file: Blob): Promise<AudioSourceInspection> {
  const first = await readFirstOggPage(file);
  const packetLength = firstOggPacketLength(first.page.segmentBytes);
  if (!packetLength || packetLength > 256) {
    throw new Error("The first Ogg identification packet is missing or oversized.");
  }
  const packetBytes = new Uint8Array(
    await file
      .slice(first.page.bodyOffset, first.page.bodyOffset + packetLength)
      .arrayBuffer(),
  );
  const packet = new DataView(
    packetBytes.buffer,
    packetBytes.byteOffset,
    packetBytes.byteLength,
  );
  const last = await lastOggGranule(file, first.page.serial);
  const metadataSignals: string[] = [];
  const notes: string[] = [];
  let codec: string;
  let channels: number;
  let sampleRateHz: number;
  let durationSeconds: number | null;
  let bitrateBps: number | null = null;

  if (ascii(packet, 0, 8) === "OpusHead" && packet.byteLength >= 19) {
    codec = "Opus";
    channels = packet.getUint8(9);
    sampleRateHz = 48_000;
    const preSkip = packet.getUint16(10, true);
    durationSeconds =
      last.granule !== null
        ? finitePositive((last.granule - preSkip) / sampleRateHz)
        : null;
    metadataSignals.push("OpusHead");
  } else if (
    packet.byteLength >= 30 &&
    packet.getUint8(0) === 1 &&
    ascii(packet, 1, 6) === "vorbis"
  ) {
    codec = "Vorbis";
    channels = packet.getUint8(11);
    sampleRateHz = packet.getUint32(12, true);
    const nominalBitrate = packet.getInt32(20, true);
    durationSeconds =
      last.granule !== null
        ? finitePositive(last.granule / sampleRateHz)
        : null;
    bitrateBps = finitePositive(nominalBitrate);
    metadataSignals.push("Vorbis identification");
  } else {
    throw new Error("The Ogg identification packet is not supported Vorbis or Opus.");
  }
  if (!channels || !sampleRateHz) {
    throw new Error("The Ogg audio identification packet is incomplete.");
  }
  if (!durationSeconds) {
    notes.push("The final Ogg granule was not available inside the bounded tail scan.");
  }
  if (!bitrateBps && durationSeconds) {
    bitrateBps = finitePositive(Math.round((file.size * 8) / durationSeconds));
    notes.push("Bitrate is the average Ogg file bitrate, including container metadata.");
  }
  return {
    mediaType: "audio",
    container: "Ogg",
    codec,
    durationSeconds,
    bitrateBps,
    sampleRateHz,
    channels,
    channelLayout: channelLayout(channels),
    bitsPerSample: null,
    metadataSignals,
    notes,
    inspectedBytes:
      first.inspectedBytes + packetBytes.byteLength + last.inspectedBytes,
    maximumInspectionBytes: MAX_OGG_INSPECTION_BYTES,
  };
}

const AMR_NB_FRAME_BYTES = [13, 14, 16, 18, 20, 21, 27, 32, 6] as const;
const AMR_WB_FRAME_BYTES = [18, 24, 33, 37, 41, 47, 51, 59, 61, 6] as const;
const AMR_NB_BITRATES = [
  4_750, 5_150, 5_900, 6_700, 7_400, 7_950, 10_200, 12_200, 0,
] as const;
const AMR_WB_BITRATES = [
  6_600, 8_850, 12_650, 14_250, 15_850, 18_250, 19_850, 23_050,
  23_850, 0,
] as const;

async function inspectAmr(file: Blob): Promise<AudioSourceInspection> {
  const signatureBytes = new Uint8Array(await file.slice(0, 9).arrayBuffer());
  const signature = String.fromCharCode(...signatureBytes);
  const wideband = signature.startsWith("#!AMR-WB\n");
  const narrowband = signature.startsWith("#!AMR\n");
  if (!wideband && !narrowband) {
    throw new Error("The selected file does not contain a valid AMR signature.");
  }
  const signatureLength = wideband ? 9 : 6;
  const frameWindow = new Uint8Array(
    await file
      .slice(signatureLength, signatureLength + MAX_AMR_FRAME_WINDOW_BYTES)
      .arrayBuffer(),
  );
  const sizes = wideband ? AMR_WB_FRAME_BYTES : AMR_NB_FRAME_BYTES;
  const bitrates = wideband ? AMR_WB_BITRATES : AMR_NB_BITRATES;
  const typeCounts = new Map<number, number>();
  let offset = 0;
  let frameBytes = 0;
  let frames = 0;
  while (offset < frameWindow.byteLength && frames < 256) {
    const frameType = (frameWindow[offset] >>> 3) & 0x0f;
    const length = sizes[frameType];
    if (!length || offset + length > frameWindow.byteLength) break;
    typeCounts.set(frameType, (typeCounts.get(frameType) ?? 0) + 1);
    frameBytes += length;
    frames += 1;
    offset += length;
  }
  if (frames < 2 || frameBytes <= 0) {
    throw new Error("The bounded AMR scan did not find two valid speech frames.");
  }
  const dominantType = [...typeCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  const durationSeconds = finitePositive(
    (((file.size - signatureLength) / (frameBytes / frames)) * 20) / 1_000,
  );
  return {
    mediaType: "audio",
    container: wideband ? "AMR-WB storage" : "AMR-NB storage",
    codec: wideband ? "AMR-WB" : "AMR-NB",
    durationSeconds,
    bitrateBps:
      dominantType === undefined
        ? null
        : finitePositive(bitrates[dominantType] ?? 0),
    sampleRateHz: wideband ? 16_000 : 8_000,
    channels: 1,
    channelLayout: "Mono",
    bitsPerSample: null,
    metadataSignals: [],
    notes: [
      `Duration is estimated from ${frames} frames inside an ${MAX_AMR_FRAME_WINDOW_BYTES.toLocaleString("en-US")}-byte bounded window.`,
    ],
    inspectedBytes: signatureBytes.byteLength + frameWindow.byteLength,
    maximumInspectionBytes: MAX_AMR_INSPECTION_BYTES,
  };
}

interface IsoBox {
  type: string;
  start: number;
  dataStart: number;
  end: number;
}

interface IsoAudioTrack {
  trackId: number | null;
  handler: string | null;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  timescale: number | null;
  durationUnits: number | null;
  encodedBytes: number | null;
  sampleCount: number | null;
}

function safeUint64Be(view: DataView, offset: number): number | null {
  if (offset + 8 > view.byteLength) return null;
  const value = view.getBigUint64(offset, false);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function isoCodec(code: string): string {
  return (
    {
      mp4a: "AAC",
      alac: "ALAC",
      samr: "AMR-NB",
      sawb: "AMR-WB",
      Opus: "Opus",
      fLaC: "FLAC",
      lpcm: "Linear PCM",
      sowt: "PCM (little-endian)",
      twos: "PCM (big-endian)",
      ".mp3": "MP3",
    } as Record<string, string>
  )[code] ?? `ISO sample entry ${code}`;
}

async function inspectIsoBmff(file: Blob): Promise<AudioSourceInspection> {
  let inspectedBytes = 0;
  let boxCount = 0;
  const read = async (offset: number, length: number): Promise<DataView> => {
    if (
      offset < 0 ||
      length < 0 ||
      offset + length > file.size ||
      inspectedBytes + length > MAX_ISO_BMFF_INSPECTION_BYTES
    ) {
      throw new Error("The ISO-BMFF structure exceeds the bounded inspection ceiling.");
    }
    const bytes = new Uint8Array(
      await file.slice(offset, offset + length).arrayBuffer(),
    );
    inspectedBytes += bytes.byteLength;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };
  const readBox = async (offset: number, parentEnd: number): Promise<IsoBox> => {
    if (offset + 8 > parentEnd) throw new Error("An ISO-BMFF box header is truncated.");
    boxCount += 1;
    if (boxCount > 1_024) {
      throw new Error("The ISO-BMFF box-count ceiling was exceeded.");
    }
    const header = await read(offset, 8);
    const size32 = header.getUint32(0, false);
    const type = ascii(header, 4, 4);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      const extended = await read(offset + 8, 8);
      size = safeUint64Be(extended, 0) ?? 0;
      headerSize = 16;
    } else if (size32 === 0) {
      size = parentEnd - offset;
    }
    if (size < headerSize || offset + size > parentEnd) {
      throw new Error(`ISO-BMFF box ${type || "unknown"} has an invalid size.`);
    }
    return {
      type,
      start: offset,
      dataStart: offset + headerSize,
      end: offset + size,
    };
  };

  const brands: string[] = [];
  const tracks: IsoAudioTrack[] = [];
  const trexDefaults = new Map<number, { duration: number; size: number }>();
  const fragmentDurations = new Map<number, number>();
  const fragmentMediaBytes = new Map<number, number>();
  const metadataSignals = new Set<string>();
  const parseMoof = async (moof: IsoBox): Promise<void> => {
    for (let offset = moof.dataStart; offset + 8 <= moof.end; ) {
      const child = await readBox(offset, moof.end);
      if (child.type === "traf") {
        let trackId: number | null = null;
        let defaultDuration: number | null = null;
        let defaultSize: number | null = null;
        for (let trafOffset = child.dataStart; trafOffset + 8 <= child.end; ) {
          const trafBox = await readBox(trafOffset, child.end);
          if (trafBox.type === "tfhd" && trafBox.end - trafBox.dataStart >= 8) {
            const length = Math.min(36, trafBox.end - trafBox.dataStart);
            const tfhd = await read(trafBox.dataStart, length);
            const flags = tfhd.getUint32(0, false) & 0x00ff_ffff;
            trackId = tfhd.getUint32(4, false);
            let cursor = 8;
            if ((flags & 0x000001) !== 0) cursor += 8;
            if ((flags & 0x000002) !== 0) cursor += 4;
            if ((flags & 0x000008) !== 0 && cursor + 4 <= tfhd.byteLength) {
              defaultDuration = tfhd.getUint32(cursor, false);
              cursor += 4;
            }
            if ((flags & 0x000010) !== 0 && cursor + 4 <= tfhd.byteLength) {
              defaultSize = tfhd.getUint32(cursor, false);
            }
          } else if (
            trafBox.type === "trun" &&
            trackId !== null &&
            trafBox.end - trafBox.dataStart >= 8
          ) {
            const payloadLength = trafBox.end - trafBox.dataStart;
            if (inspectedBytes + payloadLength <= MAX_ISO_BMFF_INSPECTION_BYTES) {
              const trun = await read(trafBox.dataStart, payloadLength);
              const flags = trun.getUint32(0, false) & 0x00ff_ffff;
              const sampleCount = trun.getUint32(4, false);
              let cursor = 8;
              if ((flags & 0x000001) !== 0) cursor += 4;
              if ((flags & 0x000004) !== 0) cursor += 4;
              const fieldsPerSample =
                ((flags & 0x000100) !== 0 ? 1 : 0) +
                ((flags & 0x000200) !== 0 ? 1 : 0) +
                ((flags & 0x000400) !== 0 ? 1 : 0) +
                ((flags & 0x000800) !== 0 ? 1 : 0);
              let duration = 0;
              let mediaBytes = 0;
              const inheritedDuration =
                defaultDuration ?? trexDefaults.get(trackId)?.duration ?? null;
              const inheritedSize =
                defaultSize ?? trexDefaults.get(trackId)?.size ?? null;
              if ((flags & 0x000100) === 0 && inheritedDuration !== null) {
                duration = inheritedDuration * sampleCount;
              }
              if ((flags & 0x000200) === 0 && inheritedSize !== null) {
                mediaBytes = inheritedSize * sampleCount;
              }
              if (fieldsPerSample > 0) {
                for (let sample = 0; sample < sampleCount; sample += 1) {
                  if (cursor + fieldsPerSample * 4 > trun.byteLength) {
                    duration = 0;
                    mediaBytes = 0;
                    break;
                  }
                  if ((flags & 0x000100) !== 0) {
                    duration += trun.getUint32(cursor, false);
                    cursor += 4;
                  }
                  if ((flags & 0x000200) !== 0) {
                    mediaBytes += trun.getUint32(cursor, false);
                    cursor += 4;
                  }
                  if ((flags & 0x000400) !== 0) cursor += 4;
                  if ((flags & 0x000800) !== 0) cursor += 4;
                }
              }
              if (duration > 0) {
                fragmentDurations.set(
                  trackId,
                  (fragmentDurations.get(trackId) ?? 0) + duration,
                );
              }
              if (mediaBytes > 0) {
                fragmentMediaBytes.set(
                  trackId,
                  (fragmentMediaBytes.get(trackId) ?? 0) + mediaBytes,
                );
              }
            }
          }
          trafOffset = trafBox.end;
        }
      }
      offset = child.end;
    }
  };
  const parseChildren = async (
    start: number,
    end: number,
    depth: number,
    track: IsoAudioTrack | null,
  ): Promise<void> => {
    if (depth > 8) throw new Error("The ISO-BMFF nesting ceiling was exceeded.");
    for (let offset = start; offset + 8 <= end; ) {
      const box = await readBox(offset, end);
      if (box.type === "trak") {
        const nextTrack: IsoAudioTrack = {
          trackId: null,
          handler: null,
          codec: null,
          sampleRateHz: null,
          channels: null,
          bitsPerSample: null,
          timescale: null,
          durationUnits: null,
          encodedBytes: null,
          sampleCount: null,
        };
        await parseChildren(box.dataStart, box.end, depth + 1, nextTrack);
        tracks.push(nextTrack);
      } else if (["moov", "mdia", "minf", "stbl", "mvex"].includes(box.type)) {
        await parseChildren(box.dataStart, box.end, depth + 1, track);
      } else if (box.type === "moof") {
        await parseMoof(box);
      } else if (box.type === "ftyp" && box.end - box.dataStart >= 4) {
        const brand = await read(box.dataStart, 4);
        brands.push(ascii(brand, 0, 4));
      } else if (box.type === "tkhd" && track) {
        const length = Math.min(32, box.end - box.dataStart);
        if (length >= 20) {
          const tkhd = await read(box.dataStart, length);
          track.trackId = tkhd.getUint8(0) === 1
            ? length >= 24
              ? tkhd.getUint32(20, false)
              : null
            : tkhd.getUint32(12, false);
        }
      } else if (box.type === "trex" && box.end - box.dataStart >= 20) {
        const trex = await read(box.dataStart, 20);
        trexDefaults.set(trex.getUint32(4, false), {
          duration: trex.getUint32(12, false),
          size: trex.getUint32(16, false),
        });
      } else if (box.type === "hdlr" && track && box.end - box.dataStart >= 12) {
        const handler = await read(box.dataStart, 12);
        track.handler = ascii(handler, 8, 4);
      } else if (box.type === "mdhd" && track) {
        const length = Math.min(36, box.end - box.dataStart);
        if (length >= 24) {
          const mdhd = await read(box.dataStart, length);
          const version = mdhd.getUint8(0);
          if (version === 0 && length >= 24) {
            track.timescale = mdhd.getUint32(12, false);
            track.durationUnits = mdhd.getUint32(16, false);
          } else if (version === 1 && length >= 32) {
            track.timescale = mdhd.getUint32(20, false);
            track.durationUnits = safeUint64Be(mdhd, 24);
          }
        }
      } else if (box.type === "stsd" && track && box.end - box.dataStart >= 16) {
        const stsd = await read(box.dataStart, 8);
        const entryCount = stsd.getUint32(4, false);
        if (entryCount > 0) {
          const entry = await readBox(box.dataStart + 8, box.end);
          const available = entry.end - entry.dataStart;
          if (available >= 28) {
            const audio = await read(entry.dataStart, 28);
            track.codec = entry.type;
            track.channels = audio.getUint16(16, false);
            const declaredBits = audio.getUint16(18, false);
            track.sampleRateHz = audio.getUint32(24, false) >>> 16;
            if (["alac", "lpcm", "sowt", "twos"].includes(entry.type)) {
              track.bitsPerSample = declaredBits || null;
            }
          }
        }
      } else if (box.type === "stsz" && track && box.end - box.dataStart >= 12) {
        const fixed = await read(box.dataStart, 12);
        const sampleSize = fixed.getUint32(4, false);
        const sampleCount = fixed.getUint32(8, false);
        track.sampleCount = sampleCount || null;
        if (sampleSize > 0) {
          track.encodedBytes = sampleSize * sampleCount;
        } else if (sampleCount > 0) {
          const tableBytes = sampleCount * 4;
          if (
            12 + tableBytes <= box.end - box.dataStart &&
            inspectedBytes + tableBytes <= MAX_ISO_BMFF_INSPECTION_BYTES
          ) {
            const sizes = await read(box.dataStart + 12, tableBytes);
            let total = 0;
            for (let index = 0; index < sampleCount; index += 1) {
              total += sizes.getUint32(index * 4, false);
            }
            track.encodedBytes = total || null;
          }
        }
      } else if (box.type === "udta") {
        metadataSignals.add("User metadata box");
      } else if (box.type === "meta") {
        metadataSignals.add("Metadata box");
      }
      if (box.end <= offset) throw new Error("ISO-BMFF box traversal did not advance.");
      offset = box.end;
    }
  };

  await parseChildren(0, file.size, 0, null);
  const majorBrand = brands[0];
  if (!majorBrand) throw new Error("The selected file has no ISO-BMFF ftyp box.");
  const audioTrack = tracks.find(
    (track) => track.handler === "soun" && track.codec !== null,
  );
  if (!audioTrack?.codec || !audioTrack.sampleRateHz || !audioTrack.channels) {
    throw new Error("The bounded ISO-BMFF scan did not find a complete audio track.");
  }
  const durationUnits =
    audioTrack.durationUnits ||
    (audioTrack.trackId === null
      ? null
      : fragmentDurations.get(audioTrack.trackId) ?? null);
  const durationSeconds =
    audioTrack.timescale && durationUnits
      ? finitePositive(durationUnits / audioTrack.timescale)
      : null;
  const encodedBytes =
    audioTrack.encodedBytes ??
    (audioTrack.trackId === null
      ? null
      : fragmentMediaBytes.get(audioTrack.trackId) ?? null);
  const encodedBitrate =
    durationSeconds && encodedBytes
      ? finitePositive(Math.round((encodedBytes * 8) / durationSeconds))
      : null;
  const fixedMonoCodec = audioTrack.codec === "samr" || audioTrack.codec === "sawb";
  const resolvedChannels = fixedMonoCodec ? 1 : audioTrack.channels;
  const resolvedSampleRate =
    audioTrack.codec === "samr"
      ? 8_000
      : audioTrack.codec === "sawb"
        ? 16_000
        : audioTrack.sampleRateHz;
  const averageAmrFrameBytes =
    fixedMonoCodec && encodedBytes && audioTrack.sampleCount
      ? encodedBytes / audioTrack.sampleCount
      : null;
  const amrModeIndex = averageAmrFrameBytes
    ? (audioTrack.codec === "sawb" ? AMR_WB_FRAME_BYTES : AMR_NB_FRAME_BYTES)
        .findIndex((bytes) => bytes === averageAmrFrameBytes)
    : -1;
  const amrModeBitrate =
    amrModeIndex >= 0
      ? (audioTrack.codec === "sawb" ? AMR_WB_BITRATES : AMR_NB_BITRATES)[
          amrModeIndex
        ]
      : null;
  const reportedBitrate = finitePositive(amrModeBitrate ?? 0) ?? encodedBitrate;
  const container = majorBrand.toLowerCase().startsWith("3g")
    ? "3GP / ISO-BMFF"
    : majorBrand.trim().toLowerCase() === "m4a"
      ? "M4A / ISO-BMFF"
      : `ISO-BMFF (${majorBrand.trim() || "unbranded"})`;
  return {
    mediaType: "audio",
    container,
    codec: isoCodec(audioTrack.codec),
    durationSeconds,
    bitrateBps:
      reportedBitrate ??
      (durationSeconds
        ? finitePositive(Math.round((file.size * 8) / durationSeconds))
        : null),
    sampleRateHz: resolvedSampleRate,
    channels: resolvedChannels,
    channelLayout: channelLayout(resolvedChannels),
    bitsPerSample: audioTrack.bitsPerSample,
    metadataSignals: [...metadataSignals],
    notes: [
      amrModeBitrate
        ? "Bitrate is the AMR codec mode identified from bounded sample-size metadata."
        : encodedBitrate
          ? "Bitrate is calculated from encoded sample bytes and media duration."
        : "Bitrate is the average ISO-BMFF file bitrate, including container metadata.",
    ],
    inspectedBytes,
    maximumInspectionBytes: MAX_ISO_BMFF_INSPECTION_BYTES,
  };
}

function guidHex(view: DataView, offset = 0): string {
  if (offset + 16 > view.byteLength) return "";
  let value = "";
  for (let index = 0; index < 16; index += 1) {
    value += view.getUint8(offset + index).toString(16).padStart(2, "0");
  }
  return value;
}

function asfAudioCodec(formatTag: number): string {
  return (
    {
      0x000a: "Windows Media Audio Voice",
      0x0160: "Windows Media Audio 1",
      0x0161: "Windows Media Audio 2",
      0x0162: "Windows Media Audio Pro",
      0x0163: "Windows Media Audio Lossless",
    } as Record<number, string>
  )[formatTag] ?? `WAVE format 0x${formatTag.toString(16).padStart(4, "0")}`;
}

async function inspectAsf(file: Blob): Promise<AudioSourceInspection> {
  const ASF_HEADER = "3026b2758e66cf11a6d900aa0062ce6c";
  const FILE_PROPERTIES = "a1dcab8c47a9cf118ee400c00c205365";
  const STREAM_PROPERTIES = "9107dcb7b7a9cf118ee600c00c205365";
  const AUDIO_MEDIA = "409e69f84d5bcf11a8fd00805f5c442b";
  const CONTENT_DESCRIPTION = "3326b2758e66cf11a6d900aa0062ce6c";
  const EXTENDED_CONTENT = "40a4d0d207e3d21197f000a0c95ea850";
  let inspectedBytes = 0;
  const read = async (offset: number, length: number): Promise<DataView> => {
    if (
      offset < 0 ||
      length < 0 ||
      offset + length > file.size ||
      inspectedBytes + length > MAX_ASF_INSPECTION_BYTES
    ) {
      throw new Error("The ASF object table exceeds the bounded inspection ceiling.");
    }
    const bytes = new Uint8Array(
      await file.slice(offset, offset + length).arrayBuffer(),
    );
    inspectedBytes += bytes.byteLength;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  };
  if (file.size < 30) throw new Error("The selected file is too small to be ASF.");
  const header = await read(0, 30);
  if (guidHex(header) !== ASF_HEADER) {
    throw new Error("The selected file does not contain a valid ASF header object.");
  }
  const headerSize = safeUint64(header, 16);
  const objectCount = header.getUint32(24, true);
  if (!headerSize || headerSize > file.size || objectCount > 128) {
    throw new Error("The ASF header size or object count is invalid.");
  }

  let durationSeconds: number | null = null;
  let codec: string | null = null;
  let bitrateBps: number | null = null;
  let sampleRateHz: number | null = null;
  let channels: number | null = null;
  const metadataSignals: string[] = [];
  let offset = 30;
  for (let index = 0; index < objectCount && offset + 24 <= headerSize; index += 1) {
    const objectHeader = await read(offset, 24);
    const id = guidHex(objectHeader);
    const size = safeUint64(objectHeader, 16);
    if (!size || size < 24 || offset + size > headerSize) {
      throw new Error("An ASF header object has an invalid size.");
    }
    const dataOffset = offset + 24;
    const payloadBytes = size - 24;
    if (id === FILE_PROPERTIES && payloadBytes >= 80) {
      const properties = await read(dataOffset, 80);
      const playDuration = safeUint64(properties, 40);
      const prerollMs = safeUint64(properties, 56);
      if (playDuration !== null && prerollMs !== null) {
        durationSeconds = finitePositive(
          playDuration / 10_000_000 - prerollMs / 1_000,
        );
      }
    } else if (id === STREAM_PROPERTIES && payloadBytes >= 72) {
      const stream = await read(dataOffset, 72);
      if (guidHex(stream) === AUDIO_MEDIA) {
        const formatTag = stream.getUint16(54, true);
        codec = asfAudioCodec(formatTag);
        channels = stream.getUint16(56, true);
        sampleRateHz = stream.getUint32(58, true);
        bitrateBps = finitePositive(stream.getUint32(62, true) * 8);
      }
    } else if (id === CONTENT_DESCRIPTION) {
      metadataSignals.push("Content description");
    } else if (id === EXTENDED_CONTENT) {
      metadataSignals.push("Extended content description");
    }
    offset += size;
  }
  if (!codec || !channels || !sampleRateHz) {
    throw new Error("The bounded ASF scan did not find a complete WMA audio stream.");
  }
  return {
    mediaType: "audio",
    container: "ASF",
    codec,
    durationSeconds,
    bitrateBps,
    sampleRateHz,
    channels,
    channelLayout: channelLayout(channels),
    bitsPerSample: null,
    metadataSignals,
    notes: [],
    inspectedBytes,
    maximumInspectionBytes: MAX_ASF_INSPECTION_BYTES,
  };
}

export async function inspectMediaSource(
  file: Blob,
  formatId: string,
): Promise<AudioSourceInspection | null> {
  if (formatId === "wav") return inspectWav(file);
  if (formatId === "mp3") return inspectMp3(file);
  if (formatId === "flac") return inspectFlac(file);
  if (formatId === "aiff") return inspectAiff(file);
  if (formatId === "aac") return inspectAac(file);
  if (formatId === "ogg" || formatId === "opus") return inspectOgg(file);
  if (formatId === "amr") return inspectAmr(file);
  if (formatId === "m4a" || formatId === "amr-wb") return inspectIsoBmff(file);
  if (formatId === "wma") return inspectAsf(file);
  return null;
}
