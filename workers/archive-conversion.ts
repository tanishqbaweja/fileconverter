import type { ConversionMetrics } from "../lib/conversion-protocol";

const IO_CHUNK_BYTES = 256 * 1024;
const TAR_BLOCK_BYTES = 512;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;
const MAX_ZIP_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_NAME_BYTES = 65_535;
const ZIP32_MAX = 0xffff_ffff;

interface ArchiveRuntime {
  file: File;
  profileId: "zip-to-tar" | "tar-to-zip";
  metrics: ConversionMetrics;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  assertActive(): void;
  progress(phase: string): void;
}

interface ZipEntry {
  name: string;
  nameBytes: Uint8Array<ArrayBuffer>;
  directory: boolean;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  centralDirectoryOffset: number;
  modifiedAtSeconds: number;
}

interface WrittenZipEntry {
  nameBytes: Uint8Array<ArrayBuffer>;
  directory: boolean;
  method: number;
  flags: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface TarEntry {
  name: string;
  directory: boolean;
  size: number;
  modifiedAtSeconds: number;
  payloadOffset: number;
  nextHeaderOffset: number;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();
const asciiDecoder = new TextDecoder("ascii", { fatal: true });

export async function runZipArchiveConversion(
  runtime: ArchiveRuntime,
): Promise<void> {
  if (runtime.profileId === "zip-to-tar") {
    await zipToTar(runtime);
  } else {
    await tarToZip(runtime);
  }
  runtime.metrics.inputBytes = runtime.file.size;
}

async function zipToTar(runtime: ArchiveRuntime): Promise<void> {
  const entries = await readZipDirectory(runtime);
  for (const entry of entries) {
    runtime.assertActive();
    runtime.progress(`Converting ZIP entry ${entry.name}`);
    const tarHeader = createTarHeader(
      entry.name,
      entry.directory ? 0 : entry.uncompressedSize,
      entry.directory,
      entry.modifiedAtSeconds,
    );
    await runtime.write(tarHeader, "Writing TAR");
    if (entry.directory) continue;

    const dataStart = await zipEntryDataOffset(runtime, entry);
    const compressedEnd = dataStart + entry.compressedSize;
    if (
      !Number.isSafeInteger(compressedEnd) ||
      compressedEnd > entry.centralDirectoryOffset
    ) {
      throw new Error(`ZIP entry data is truncated: ${entry.name}.`);
    }
    let source = boundedBlobStream(
      runtime.file.slice(dataStart, compressedEnd),
      runtime,
    );
    if (entry.method === 8) {
      source = source.pipeThrough(
        new DecompressionStream("deflate-raw" as CompressionFormat),
      );
    }
    const reader = source.getReader();
    let crc = 0xffff_ffff;
    let decodedBytes = 0;
    for (;;) {
      runtime.assertActive();
      const { done, value } = await reader.read();
      if (done) break;
      decodedBytes += value.byteLength;
      if (
        decodedBytes > entry.uncompressedSize ||
        decodedBytes > MAX_ARCHIVE_BYTES
      ) {
        throw new Error(`ZIP entry expands beyond its declared size: ${entry.name}.`);
      }
      crc = updateCrc32(crc, value);
      await runtime.write(value, "Writing TAR");
    }
    const actualCrc = (crc ^ 0xffff_ffff) >>> 0;
    if (
      decodedBytes !== entry.uncompressedSize ||
      actualCrc !== entry.crc32
    ) {
      throw new Error(`ZIP entry CRC or decoded size is invalid: ${entry.name}.`);
    }
    const padding = (TAR_BLOCK_BYTES - (decodedBytes % TAR_BLOCK_BYTES)) %
      TAR_BLOCK_BYTES;
    if (padding) {
      await runtime.write(new Uint8Array(padding), "Writing TAR padding");
    }
  }
  await runtime.write(new Uint8Array(TAR_BLOCK_BYTES * 2), "Finalizing TAR");
}

async function tarToZip(runtime: ArchiveRuntime): Promise<void> {
  const entries: WrittenZipEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let zeroBlocks = 0;
  let totalPayloadBytes = 0;

  while (offset + TAR_BLOCK_BYTES <= runtime.file.size) {
    runtime.assertActive();
    const header = await readBlobBytes(
      runtime.file.slice(offset, offset + TAR_BLOCK_BYTES),
      TAR_BLOCK_BYTES,
      runtime,
    );
    if (header.every((value) => value === 0)) {
      zeroBlocks += 1;
      offset += TAR_BLOCK_BYTES;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks) {
      throw new Error("TAR contains data between its end-marker blocks.");
    }
    const tarEntry = parseTarHeader(header, offset);
    if (seen.has(tarEntry.name)) {
      throw new Error(`TAR contains a duplicate entry name: ${tarEntry.name}.`);
    }
    seen.add(tarEntry.name);
    if (seen.size > MAX_ARCHIVE_ENTRIES) {
      throw new Error(
        `TAR exceeds the ${MAX_ARCHIVE_ENTRIES.toLocaleString("en-US")}-entry safety limit.`,
      );
    }
    totalPayloadBytes += tarEntry.size;
    if (totalPayloadBytes > MAX_ARCHIVE_BYTES) {
      throw new Error("TAR payload exceeds the 64 GiB safety limit.");
    }
    if (tarEntry.nextHeaderOffset > runtime.file.size) {
      throw new Error(`TAR entry payload is truncated: ${tarEntry.name}.`);
    }

    runtime.progress(`Converting TAR entry ${tarEntry.name}`);
    const nameBytes = utf8Encoder.encode(tarEntry.name);
    if (nameBytes.byteLength > MAX_ZIP_NAME_BYTES) {
      throw new Error(`TAR entry name is too long for ZIP: ${tarEntry.name}.`);
    }
    const directory = tarEntry.directory;
    const method = directory ? 0 : 8;
    const flags = 0x0808;
    const { dosTime, dosDate } = unixToDos(tarEntry.modifiedAtSeconds);
    const localHeaderOffset = runtime.metrics.outputBytes;
    ensureZip32(localHeaderOffset, "ZIP local-header offset");
    await runtime.write(
      createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
      "Writing ZIP header",
    );

    let crc = 0xffff_ffff;
    let compressedSize = 0;
    let uncompressedSize = 0;
    if (!directory) {
      const payload = boundedBlobStream(
        runtime.file.slice(
          tarEntry.payloadOffset,
          tarEntry.payloadOffset + tarEntry.size,
        ),
        runtime,
      ).pipeThrough(
        new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
          transform(chunk, controller) {
            crc = updateCrc32(crc, chunk);
            uncompressedSize += chunk.byteLength;
            controller.enqueue(chunk);
          },
        }),
      );
      const compressed = payload.pipeThrough(
        new CompressionStream("deflate-raw" as CompressionFormat),
      );
      const reader = compressed.getReader();
      for (;;) {
        runtime.assertActive();
        const { done, value } = await reader.read();
        if (done) break;
        compressedSize += value.byteLength;
        ensureZip32(compressedSize, "ZIP compressed entry size");
        await runtime.write(value, "Writing ZIP data");
      }
      if (uncompressedSize !== tarEntry.size) {
        throw new Error(`TAR entry payload is truncated: ${tarEntry.name}.`);
      }
    }
    const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
    ensureZip32(uncompressedSize, "ZIP uncompressed entry size");
    await runtime.write(
      createZipDataDescriptor(finalCrc, compressedSize, uncompressedSize),
      "Writing ZIP descriptor",
    );
    entries.push({
      nameBytes,
      directory,
      method,
      flags,
      dosTime,
      dosDate,
      crc32: finalCrc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = tarEntry.nextHeaderOffset;
    runtime.metrics.inputBytes = Math.min(runtime.file.size, offset);
  }

  if (zeroBlocks < 2) {
    throw new Error("TAR input is missing its two-block end marker.");
  }
  if (entries.length === 0) {
    throw new Error("TAR contains no entries.");
  }
  await assertRemainingTarBytesAreZero(runtime, offset);

  const centralDirectoryOffset = runtime.metrics.outputBytes;
  ensureZip32(centralDirectoryOffset, "ZIP central-directory offset");
  for (const entry of entries) {
    await runtime.write(
      createZipCentralHeader(entry),
      "Writing ZIP directory",
    );
  }
  const centralDirectorySize =
    runtime.metrics.outputBytes - centralDirectoryOffset;
  ensureZip32(centralDirectorySize, "ZIP central-directory size");
  if (centralDirectorySize > MAX_ZIP_DIRECTORY_BYTES) {
    throw new Error("ZIP central directory exceeds the 8 MiB safety limit.");
  }
  await runtime.write(
    createZipEndRecord(
      entries.length,
      centralDirectorySize,
      centralDirectoryOffset,
    ),
    "Finalizing ZIP",
  );
}

async function readZipDirectory(runtime: ArchiveRuntime): Promise<ZipEntry[]> {
  if (runtime.file.size < 22) {
    throw new Error("ZIP input is missing its end-of-central-directory record.");
  }
  const tailBytes = Math.min(runtime.file.size, 65_557);
  const tailStart = runtime.file.size - tailBytes;
  const tail = await readBlobBytes(
    runtime.file.slice(tailStart),
    65_557,
    runtime,
  );
  let endOffset = -1;
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
    if (readU32(tail, offset) !== 0x06054b50) continue;
    const commentBytes = readU16(tail, offset + 20);
    if (offset + 22 + commentBytes === tail.byteLength) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error("ZIP end-of-central-directory record is invalid.");
  }
  const disk = readU16(tail, endOffset + 4);
  const directoryDisk = readU16(tail, endOffset + 6);
  const diskEntries = readU16(tail, endOffset + 8);
  const entryCount = readU16(tail, endOffset + 10);
  const directorySize = readU32(tail, endOffset + 12);
  const directoryOffset = readU32(tail, endOffset + 16);
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== entryCount ||
    entryCount === 0xffff ||
    directorySize === ZIP32_MAX ||
    directoryOffset === ZIP32_MAX
  ) {
    throw new Error("Multi-disk and ZIP64 archives are not accepted.");
  }
  if (entryCount < 1 || entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error(
      `ZIP entry count exceeds the ${MAX_ARCHIVE_ENTRIES.toLocaleString("en-US")}-entry safety limit.`,
    );
  }
  if (
    directorySize > MAX_ZIP_DIRECTORY_BYTES ||
    directoryOffset + directorySize > tailStart + endOffset
  ) {
    throw new Error("ZIP central directory exceeds its bounded range.");
  }
  const directory = await readBlobBytes(
    runtime.file.slice(
      directoryOffset,
      directoryOffset + directorySize,
    ),
    MAX_ZIP_DIRECTORY_BYTES,
    runtime,
  );
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directory.byteLength ||
        readU32(directory, offset) !== 0x02014b50) {
      throw new Error("ZIP central directory is truncated or malformed.");
    }
    const flags = readU16(directory, offset + 8);
    const method = readU16(directory, offset + 10);
    const dosTime = readU16(directory, offset + 12);
    const dosDate = readU16(directory, offset + 14);
    const crc32 = readU32(directory, offset + 16);
    const compressedSize = readU32(directory, offset + 20);
    const uncompressedSize = readU32(directory, offset + 24);
    const nameLength = readU16(directory, offset + 28);
    const extraLength = readU16(directory, offset + 30);
    const commentLength = readU16(directory, offset + 32);
    const startDisk = readU16(directory, offset + 34);
    const versionMadeBy = readU16(directory, offset + 4);
    const externalAttributes = readU32(directory, offset + 38);
    const localHeaderOffset = readU32(directory, offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (
      next > directory.byteLength ||
      startDisk !== 0 ||
      compressedSize === ZIP32_MAX ||
      uncompressedSize === ZIP32_MAX ||
      localHeaderOffset === ZIP32_MAX
    ) {
      throw new Error("ZIP64 or truncated central-directory entries are not accepted.");
    }
    if (flags & 0x0001) {
      throw new Error("Encrypted ZIP entries are not accepted.");
    }
    const permittedFlags = method === 8 ? 0x080e : 0x0808;
    if (flags & ~permittedFlags) {
      throw new Error("ZIP entry uses unsupported general-purpose flags.");
    }
    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported ZIP compression method: ${method}.`);
    }
    const nameBytes = directory.slice(offset + 46, offset + 46 + nameLength);
    const name = decodeZipName(nameBytes, Boolean(flags & 0x0800));
    validateArchivePath(name, "ZIP entry");
    if (seen.has(name)) {
      throw new Error(`ZIP contains a duplicate entry name: ${name}.`);
    }
    seen.add(name);
    const directoryEntry = name.endsWith("/");
    const creatorSystem = versionMadeBy >>> 8;
    const unixFileType =
      creatorSystem === 3 ? (externalAttributes >>> 16) & 0xf000 : 0;
    if (unixFileType === 0xa000) {
      throw new Error(`ZIP symbolic links are not accepted: ${name}.`);
    }
    if (
      unixFileType !== 0 &&
      unixFileType !== 0x4000 &&
      unixFileType !== 0x8000
    ) {
      throw new Error(`ZIP special-file entries are not accepted: ${name}.`);
    }
    if (
      (unixFileType === 0x4000 || Boolean(externalAttributes & 0x10)) &&
      !directoryEntry
    ) {
      throw new Error(`ZIP directory entry lacks a trailing slash: ${name}.`);
    }
    if (directoryEntry && (compressedSize !== 0 || uncompressedSize !== 0)) {
      throw new Error(`ZIP directory entry contains payload bytes: ${name}.`);
    }
    if (method === 0 && compressedSize !== uncompressedSize) {
      throw new Error(`Stored ZIP entry sizes disagree: ${name}.`);
    }
    totalUncompressed += uncompressedSize;
    if (
      totalUncompressed > MAX_ARCHIVE_BYTES ||
      (totalUncompressed > 1024 * 1024 &&
        totalUncompressed / Math.max(1, runtime.file.size) >
          MAX_EXPANSION_RATIO)
    ) {
      throw new Error("ZIP expansion exceeds the 64 GiB or 100:1 safety limit.");
    }
    entries.push({
      name,
      nameBytes,
      directory: directoryEntry,
      flags,
      method,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      centralDirectoryOffset: directoryOffset,
      modifiedAtSeconds: dosToUnix(dosDate, dosTime),
    });
    offset = next;
  }
  if (offset !== directory.byteLength) {
    throw new Error("ZIP central directory contains unexpected trailing data.");
  }
  return entries;
}

async function zipEntryDataOffset(
  runtime: ArchiveRuntime,
  entry: ZipEntry,
): Promise<number> {
  const fixed = await readBlobBytes(
    runtime.file.slice(
      entry.localHeaderOffset,
      entry.localHeaderOffset + 30,
    ),
    30,
    runtime,
  );
  if (fixed.byteLength !== 30 || readU32(fixed, 0) !== 0x04034b50) {
    throw new Error(`ZIP local header is invalid: ${entry.name}.`);
  }
  const flags = readU16(fixed, 6);
  const method = readU16(fixed, 8);
  const crc32 = readU32(fixed, 14);
  const compressedSize = readU32(fixed, 18);
  const uncompressedSize = readU32(fixed, 22);
  const nameLength = readU16(fixed, 26);
  const extraLength = readU16(fixed, 28);
  if (
    flags !== entry.flags ||
    method !== entry.method ||
    (!(flags & 0x0008) &&
      (crc32 !== entry.crc32 ||
        compressedSize !== entry.compressedSize ||
        uncompressedSize !== entry.uncompressedSize))
  ) {
    throw new Error(`ZIP local header disagrees with its directory: ${entry.name}.`);
  }
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (dataOffset > entry.centralDirectoryOffset) {
    throw new Error(`ZIP local entry metadata overlaps its directory: ${entry.name}.`);
  }
  const variable = await readBlobBytes(
    runtime.file.slice(
      entry.localHeaderOffset + 30,
      entry.localHeaderOffset + 30 + nameLength + extraLength,
    ),
    MAX_ZIP_NAME_BYTES + 65_535,
    runtime,
  );
  const localName = decodeZipName(
    variable.slice(0, nameLength),
    Boolean(flags & 0x0800),
  );
  if (localName !== entry.name) {
    throw new Error(`ZIP local entry name disagrees with its directory: ${entry.name}.`);
  }
  return dataOffset;
}

function parseTarHeader(header: Uint8Array, headerOffset: number): TarEntry {
  const expectedChecksum = parseTarOctal(header.subarray(148, 156), "checksum");
  let actualChecksum = 0;
  for (let index = 0; index < TAR_BLOCK_BYTES; index += 1) {
    actualChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actualChecksum !== expectedChecksum) {
    throw new Error("TAR header checksum is invalid.");
  }
  if (asciiDecoder.decode(header.subarray(257, 262)) !== "ustar") {
    throw new Error("TAR header is not in the bounded USTAR format.");
  }
  const type = String.fromCharCode(header[156] || 0x30);
  if (type === "x" || type === "g" || type === "L" || type === "K") {
    throw new Error(
      "PAX and GNU extended TAR records are not accepted by this bounded USTAR profile.",
    );
  }
  if (type !== "0" && type !== "\0" && type !== "5") {
    throw new Error(`Unsupported TAR entry type: ${type}.`);
  }
  const name = readTarString(header.subarray(0, 100));
  const prefix = readTarString(header.subarray(345, 500));
  const fullName = prefix ? `${prefix}/${name}` : name;
  validateArchivePath(fullName, "TAR entry");
  const directory = type === "5";
  const size = parseTarOctal(header.subarray(124, 136), "size");
  if (directory && size !== 0) {
    throw new Error(`TAR directory entry contains payload bytes: ${fullName}.`);
  }
  const modifiedAtSeconds = parseTarOctal(
    header.subarray(136, 148),
    "modification time",
  );
  const payloadOffset = headerOffset + TAR_BLOCK_BYTES;
  const paddedSize = Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
  return {
    name: directory && !fullName.endsWith("/") ? `${fullName}/` : fullName,
    directory,
    size,
    modifiedAtSeconds,
    payloadOffset,
    nextHeaderOffset: payloadOffset + paddedSize,
  };
}

function createTarHeader(
  name: string,
  size: number,
  directory: boolean,
  modifiedAtSeconds: number,
): Uint8Array<ArrayBuffer> {
  validateArchivePath(name, "ZIP entry");
  const normalized = directory && !name.endsWith("/") ? `${name}/` : name;
  const [prefix, base] = splitUstarName(normalized);
  const header = new Uint8Array(TAR_BLOCK_BYTES);
  writeAscii(header, 0, 100, base);
  writeTarOctal(header, 100, 8, directory ? 0o755 : 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, size);
  writeTarOctal(header, 136, 12, Math.max(0, Math.floor(modifiedAtSeconds)));
  header.fill(0x20, 148, 156);
  header[156] = directory ? 0x35 : 0x30;
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  writeAscii(header, 265, 32, "within");
  writeAscii(header, 297, 32, "within");
  writeAscii(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  writeAscii(header, 148, 6, checksumText);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function splitUstarName(name: string): [string, string] {
  const encoded = utf8Encoder.encode(name);
  if (encoded.byteLength <= 100) return ["", name];
  const slashes = [...name.matchAll(/\//g)].map((match) => match.index ?? -1);
  for (let index = slashes.length - 1; index >= 0; index -= 1) {
    const split = slashes[index];
    const prefix = name.slice(0, split);
    const base = name.slice(split + 1);
    if (
      base &&
      utf8Encoder.encode(prefix).byteLength <= 155 &&
      utf8Encoder.encode(base).byteLength <= 100
    ) {
      return [prefix, base];
    }
  }
  throw new Error(`ZIP entry name is not representable in USTAR: ${name}.`);
}

function createZipLocalHeader(
  name: Uint8Array,
  flags: number,
  method: number,
  dosTime: number,
  dosDate: number,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(30 + name.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, flags, true);
  view.setUint16(8, method, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint16(26, name.byteLength, true);
  bytes.set(name, 30);
  return bytes;
}

function createZipDataDescriptor(
  crc32: number,
  compressedSize: number,
  uncompressedSize: number,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc32, true);
  view.setUint32(8, compressedSize, true);
  view.setUint32(12, uncompressedSize, true);
  return bytes;
}

function createZipCentralHeader(
  entry: WrittenZipEntry,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 0x0314, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, entry.flags, true);
  view.setUint16(10, entry.method, true);
  view.setUint16(12, entry.dosTime, true);
  view.setUint16(14, entry.dosDate, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.compressedSize, true);
  view.setUint32(24, entry.uncompressedSize, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint32(38, entry.directory ? 0x10 : 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  bytes.set(entry.nameBytes, 46);
  return bytes;
}

function createZipEndRecord(
  entries: number,
  directorySize: number,
  directoryOffset: number,
): Uint8Array<ArrayBuffer> {
  if (entries > 0xffff) {
    throw new Error("ZIP entry count exceeds the non-ZIP64 limit.");
  }
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries, true);
  view.setUint16(10, entries, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  return bytes;
}

function boundedBlobStream(
  blob: Blob,
  runtime: ArchiveRuntime,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const reader = blob.stream().getReader({ mode: "byob" });
  let readBuffer = new Uint8Array(IO_CHUNK_BYTES);
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        runtime.assertActive();
        const { done, value } = await reader.read(readBuffer);
        if (done) {
          controller.close();
          return;
        }
        const owned = new Uint8Array(value.byteLength);
        owned.set(value);
        recordInputRead(runtime, owned.byteLength);
        readBuffer =
          value.buffer.byteLength >= IO_CHUNK_BYTES
            ? new Uint8Array(value.buffer, 0, IO_CHUNK_BYTES)
            : new Uint8Array(IO_CHUNK_BYTES);
        controller.enqueue(owned);
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => {});
      },
    },
    { highWaterMark: 1 },
  );
}

async function readBlobBytes(
  blob: Blob,
  maximumBytes: number,
  runtime: ArchiveRuntime,
): Promise<Uint8Array<ArrayBuffer>> {
  if (blob.size > maximumBytes) {
    throw new Error(`Archive metadata exceeds its ${maximumBytes}-byte safety limit.`);
  }
  const output = new Uint8Array(blob.size);
  const reader = boundedBlobStream(blob, runtime).getReader();
  let offset = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    output.set(value, offset);
    offset += value.byteLength;
  }
  return offset === output.byteLength ? output : output.slice(0, offset);
}

function recordInputRead(runtime: ArchiveRuntime, bytes: number): void {
  runtime.metrics.inputBytes = Math.min(
    runtime.file.size,
    runtime.metrics.inputBytes + bytes,
  );
  runtime.metrics.maxReadChunkBytes = Math.max(
    runtime.metrics.maxReadChunkBytes,
    bytes,
  );
}

async function assertRemainingTarBytesAreZero(
  runtime: ArchiveRuntime,
  offset: number,
): Promise<void> {
  const reader = boundedBlobStream(runtime.file.slice(offset), runtime).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value.every((byte) => byte === 0)) {
      throw new Error("TAR contains non-zero data after its end marker.");
    }
  }
}

function decodeZipName(bytes: Uint8Array, utf8: boolean): string {
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) {
    throw new Error("Non-UTF-8 ZIP filenames outside ASCII are not accepted.");
  }
  return (utf8 ? utf8Decoder : asciiDecoder).decode(bytes);
}

function validateArchivePath(value: string, field: string): void {
  const withoutTrailingSlash = value.endsWith("/") ? value.slice(0, -1) : value;
  if (
    !withoutTrailingSlash ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    withoutTrailingSlash
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Unsafe ${field}: ${value || "(empty)"}.`);
  }
}

function parseTarOctal(bytes: Uint8Array, field: string): number {
  if (bytes[0] & 0x80) {
    throw new Error(`Base-256 TAR ${field} is not accepted.`);
  }
  const text = asciiDecoder.decode(bytes).replace(/\0.*$/, "").trim();
  if (!/^[0-7]+$/.test(text)) {
    throw new Error(`TAR ${field} is not valid octal.`);
  }
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`TAR ${field} exceeds the safe integer range.`);
  }
  return value;
}

function readTarString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return utf8Decoder.decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function writeTarOctal(
  target: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const text = value.toString(8);
  if (text.length > length - 1) {
    throw new Error("TAR numeric field exceeds the USTAR range.");
  }
  writeAscii(target, offset, length - 1, text.padStart(length - 1, "0"));
  target[offset + length - 1] = 0;
}

function writeAscii(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = utf8Encoder.encode(value);
  if (bytes.byteLength > length) {
    throw new Error("Archive metadata exceeds its fixed-width field.");
  }
  target.set(bytes, offset);
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new Error("ZIP metadata is truncated.");
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    2,
  ).getUint16(0, true);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new Error("ZIP metadata is truncated.");
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    4,
  ).getUint32(0, true);
}

function ensureZip32(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP32_MAX) {
    throw new Error(`${field} requires unsupported ZIP64 output.`);
  }
}

function dosToUnix(date: number, time: number): number {
  const year = 1980 + ((date >>> 9) & 0x7f);
  const month = (date >>> 5) & 0x0f;
  const day = date & 0x1f;
  const hour = (time >>> 11) & 0x1f;
  const minute = (time >>> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return 0;
  }
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
}

function unixToDos(seconds: number): { dosTime: number; dosDate: number } {
  const date = new Date(Math.max(315_532_800, seconds) * 1000);
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  return {
    dosTime:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    dosDate:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let value = crc >>> 0;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}
