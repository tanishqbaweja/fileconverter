export const MAX_WAV_INSPECTION_BYTES = 256 * 1024;
export const MAX_MP3_INSPECTION_BYTES = 10 + 4_096 + 128;
export const MAX_FLAC_INSPECTION_BYTES = 256 * 1024;
export const MAX_AIFF_INSPECTION_BYTES = 256 * 1024;
export const MAX_AAC_INSPECTION_BYTES = 10 + 32 * 7;

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

export async function inspectMediaSource(
  file: Blob,
  formatId: string,
): Promise<AudioSourceInspection | null> {
  if (formatId === "wav") return inspectWav(file);
  if (formatId === "mp3") return inspectMp3(file);
  if (formatId === "flac") return inspectFlac(file);
  if (formatId === "aiff") return inspectAiff(file);
  if (formatId === "aac") return inspectAac(file);
  return null;
}
