export const MAX_PACKAGE_DIRECTORY_BYTES = 1024 * 1024;
export const MAX_PACKAGE_TAIL_BYTES = 65_557;
export const MAX_PACKAGE_INSPECTION_BYTES =
  MAX_PACKAGE_TAIL_BYTES + MAX_PACKAGE_DIRECTORY_BYTES;
export const MAX_TAR_HEADER_READS = 256;
export const MAX_TAR_INSPECTION_BYTES = MAX_TAR_HEADER_READS * 512;
export const MAX_COMPRESSION_HEADER_BYTES = 64 * 1024;

export interface PackageSourceFact {
  label: string;
  value: string;
}

export interface PackageSourceInspection {
  structure: string;
  facts: readonly PackageSourceFact[];
  notes: readonly string[];
  inspectedBytes: number;
  maximumInspectionBytes: number;
  completeCentralDirectory: boolean;
}

const supportedFormats = new Set([
  "bzip2",
  "docx",
  "epub",
  "gzip",
  "odp",
  "ods",
  "odt",
  "pptx",
  "sevenzip",
  "tar",
  "tar-bz2",
  "tar-gz",
  "tar-xz",
  "xlsx",
  "xz",
  "zip",
]);

const structures: Readonly<Record<string, string>> = {
  docx: "WordprocessingML package",
  epub: "EPUB publication package",
  odp: "OpenDocument presentation package",
  ods: "OpenDocument spreadsheet package",
  odt: "OpenDocument text package",
  pptx: "PresentationML package",
  xlsx: "SpreadsheetML package",
  zip: "ZIP archive package",
};

const archiveStructures: Readonly<Record<string, string>> = {
  bzip2: "BZIP2 compressed stream",
  gzip: "GZIP compressed stream",
  sevenzip: "7Z archive header",
  tar: "TAR archive directory",
  "tar-bz2": "BZIP2-compressed TAR wrapper",
  "tar-gz": "GZIP-compressed TAR wrapper",
  "tar-xz": "XZ-compressed TAR wrapper",
  xz: "XZ compressed stream",
};

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    offset,
    true,
  );
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

function decodeEntryName(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function unsafeEntryPath(name: string): boolean {
  if (
    name.length === 0 ||
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(name) ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    name.includes("\\")
  ) {
    return true;
  }
  return name.split("/").some((part) => part === "..");
}

function exactOrLowerBound(
  count: number,
  complete: boolean,
  declared: number,
): string {
  return complete
    ? count.toLocaleString("en-US")
    : `At least ${count.toLocaleString("en-US")} of ${declared.toLocaleString("en-US")} declared entries`;
}

function markerFacts(
  format: string,
  names: ReadonlySet<string>,
  complete: boolean,
): PackageSourceFact[] {
  const present = (name: string) =>
    names.has(name)
      ? "Present"
      : complete
        ? "Not found"
        : "Not found in inspected directory prefix";
  const count = (value: number) =>
    complete
      ? value.toLocaleString("en-US")
      : `At least ${value.toLocaleString("en-US")} in inspected directory prefix`;
  if (format === "docx") {
    return [
      { label: "Package content types", value: present("[Content_Types].xml") },
      { label: "Main document part", value: present("word/document.xml") },
      {
        label: "Header/footer parts",
        value: count(
          [...names].filter((name) =>
            /^word\/(?:header|footer)\d+\.xml$/i.test(name),
          ).length,
        ),
      },
    ];
  }
  if (format === "xlsx") {
    return [
      { label: "Package content types", value: present("[Content_Types].xml") },
      { label: "Workbook part", value: present("xl/workbook.xml") },
      {
        label: "Worksheet parts",
        value: count(
          [...names].filter((name) =>
            /^xl\/worksheets\/sheet\d+\.xml$/i.test(name),
          ).length,
        ),
      },
    ];
  }
  if (format === "pptx") {
    return [
      { label: "Package content types", value: present("[Content_Types].xml") },
      { label: "Presentation part", value: present("ppt/presentation.xml") },
      {
        label: "Slide parts",
        value: count(
          [...names].filter((name) =>
            /^ppt\/slides\/slide\d+\.xml$/i.test(name),
          ).length,
        ),
      },
      {
        label: "Speaker-note parts",
        value: count(
          [...names].filter((name) =>
            /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name),
          ).length,
        ),
      },
    ];
  }
  if (format === "odt" || format === "ods" || format === "odp") {
    return [
      { label: "MIME declaration entry", value: present("mimetype") },
      { label: "Content document", value: present("content.xml") },
      { label: "Package manifest", value: present("META-INF/manifest.xml") },
      {
        label: "Embedded object/media entries",
        value: count(
          [...names].filter((name) => /^(?:Object|Pictures)\//.test(name)).length,
        ),
      },
    ];
  }
  if (format === "epub") {
    return [
      { label: "MIME declaration entry", value: present("mimetype") },
      { label: "Container descriptor", value: present("META-INF/container.xml") },
      {
        label: "Publication package documents",
        value: count([...names].filter((name) => /\.opf$/i.test(name)).length),
      },
      {
        label: "HTML content documents",
        value: count(
          [...names].filter((name) => /\.(?:xhtml|html|htm)$/i.test(name)).length,
        ),
      },
    ];
  }
  return [];
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("ascii").decode(bytes.subarray(offset, offset + length));
}

function tarString(bytes: Uint8Array, offset: number, length: number): string {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return new TextDecoder("utf-8", { fatal: false })
    .decode(end < 0 ? field : field.subarray(0, end))
    .trim();
}

function tarNumber(bytes: Uint8Array, offset: number, length: number): number | null {
  if ((bytes[offset] & 0x80) !== 0) {
    let value = BigInt(bytes[offset] & 0x7f);
    for (let index = 1; index < length; index += 1) {
      value = (value << BigInt(8)) | BigInt(bytes[offset + index]);
    }
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
  }
  const text = tarString(bytes, offset, length).replace(/\0/g, "").trim();
  if (!/^[0-7]*$/.test(text)) return null;
  return text.length === 0 ? 0 : Number.parseInt(text, 8);
}

function tarChecksumValid(header: Uint8Array): boolean {
  const expected = tarNumber(header, 148, 8);
  if (expected === null) return false;
  let sum = 0;
  for (let index = 0; index < 512; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  return sum === expected;
}

async function inspectTarSource(file: File): Promise<PackageSourceInspection> {
  if (file.size < 1024) throw new Error("TAR input is missing its bounded end markers.");
  let offset = 0;
  let inspectedBytes = 0;
  let entries = 0;
  let regularFiles = 0;
  let directories = 0;
  let links = 0;
  let otherTypes = 0;
  let unsafePaths = 0;
  let declaredPayloadBytes = 0;
  let zeroBlocks = 0;
  let completeDirectory = false;
  while (inspectedBytes + 512 <= MAX_TAR_INSPECTION_BYTES && offset + 512 <= file.size) {
    const header = new Uint8Array(await file.slice(offset, offset + 512).arrayBuffer());
    inspectedBytes += header.byteLength;
    if (header.every((value) => value === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks === 2) {
        completeDirectory = true;
        break;
      }
      continue;
    }
    zeroBlocks = 0;
    if (!tarChecksumValid(header)) {
      throw new Error("TAR input has an invalid bounded header checksum.");
    }
    const size = tarNumber(header, 124, 12);
    if (size === null) throw new Error("TAR entry size exceeds the safe integer range.");
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    if (unsafeEntryPath(path)) unsafePaths += 1;
    const type = header[156];
    if (type === 0 || type === 0x30) regularFiles += 1;
    else if (type === 0x35) directories += 1;
    else if (type === 0x31 || type === 0x32) links += 1;
    else otherTypes += 1;
    declaredPayloadBytes += size;
    entries += 1;
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(next) || next <= offset || next > file.size + 1024) {
      throw new Error("TAR entry bounds are invalid.");
    }
    offset = next;
  }
  const value = (count: number) =>
    completeDirectory
      ? count.toLocaleString("en-US")
      : `At least ${count.toLocaleString("en-US")} in ${entries.toLocaleString("en-US")} inspected entries`;
  return {
    structure: archiveStructures.tar,
    facts: [
      { label: "Inspected entries", value: completeDirectory ? entries.toLocaleString("en-US") : `At least ${entries.toLocaleString("en-US")}` },
      { label: "Regular files", value: value(regularFiles) },
      { label: "Directories", value: value(directories) },
      { label: "Link entries", value: value(links) },
      { label: "Other entry types", value: value(otherTypes) },
      { label: "Unsafe entry paths", value: value(unsafePaths) },
      {
        label: "Inspected declared payload bytes",
        value: completeDirectory
          ? declaredPayloadBytes.toLocaleString("en-US")
          : `At least ${declaredPayloadBytes.toLocaleString("en-US")}`,
      },
    ],
    notes: [
      completeDirectory
        ? "The complete TAR header chain ended inside the fixed inspection budget."
        : `Inspection stopped after ${MAX_TAR_HEADER_READS.toLocaleString("en-US")} bounded 512-byte header reads; counts are lower bounds.`,
      "Entry payloads and embedded file contents were not read, displayed, retained, or uploaded.",
      "Complete checksum, path, type, expansion, and payload validation remains in the conversion worker.",
    ],
    inspectedBytes,
    maximumInspectionBytes: MAX_TAR_INSPECTION_BYTES,
    completeCentralDirectory: completeDirectory,
  };
}

async function inspectCompressionSource(
  file: File,
  format: "bzip2" | "gzip" | "tar-bz2" | "tar-gz" | "tar-xz" | "xz",
): Promise<PackageSourceInspection> {
  const prefixBytes = Math.min(file.size, MAX_COMPRESSION_HEADER_BYTES);
  const prefix = new Uint8Array(await file.slice(0, prefixBytes).arrayBuffer());
  const facts: PackageSourceFact[] = [];
  let inspectedBytes = prefix.byteLength;
  if (format === "gzip" || format === "tar-gz") {
    if (prefix.byteLength < 10 || prefix[0] !== 0x1f || prefix[1] !== 0x8b || prefix[2] !== 8) {
      throw new Error("GZIP input has an invalid compression header.");
    }
    const flags = prefix[3];
    const modified = readU32(prefix, 4);
    facts.push(
      { label: "Compression method", value: "DEFLATE" },
      { label: "Original-name field", value: (flags & 0x08) !== 0 ? "Present but not displayed" : "Absent" },
      { label: "Comment field", value: (flags & 0x10) !== 0 ? "Present but not displayed" : "Absent" },
      { label: "Header checksum", value: (flags & 0x02) !== 0 ? "Present" : "Absent" },
      { label: "Modification time", value: modified === 0 ? "Not declared" : "Declared in header" },
    );
    if (file.size >= 18) {
      const trailer = new Uint8Array(await file.slice(file.size - 8).arrayBuffer());
      inspectedBytes += trailer.byteLength;
      facts.push(
        { label: "Trailer CRC-32", value: "Present; verified during conversion" },
        { label: "Uncompressed bytes modulo 2^32", value: readU32(trailer, 4).toLocaleString("en-US") },
      );
    }
  } else if (format === "bzip2" || format === "tar-bz2") {
    if (prefix.byteLength < 10 || ascii(prefix, 0, 3) !== "BZh" || prefix[3] < 0x31 || prefix[3] > 0x39) {
      throw new Error("BZIP2 input has an invalid stream header.");
    }
    facts.push(
      { label: "Compression method", value: "BZIP2" },
      { label: "Declared block size", value: `${prefix[3] - 0x30}00 KiB` },
      { label: "First block marker", value: ascii(prefix, 4, 6) === "1AY&SY" ? "Present" : "Validated during conversion" },
    );
  } else {
    if (
      prefix.byteLength < 12 ||
      ![0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00].every((value, index) => prefix[index] === value)
    ) {
      throw new Error("XZ input has an invalid stream header.");
    }
    const checkNames: Record<number, string> = { 0: "None", 1: "CRC-32", 4: "CRC-64", 10: "SHA-256" };
    facts.push(
      { label: "Compression method", value: "XZ/LZMA2 container" },
      { label: "Integrity check", value: checkNames[prefix[7] & 0x0f] ?? `Type ${prefix[7] & 0x0f}` },
      { label: "Stream-header CRC", value: "Present; verified during conversion" },
    );
  }
  const tarWrapped = format.startsWith("tar-");
  if (tarWrapped) {
    facts.push({ label: "Inner TAR directory", value: "Inspected during bounded streaming conversion" });
  }
  return {
    structure: archiveStructures[format],
    facts,
    notes: [
      "Only bounded wrapper header/trailer metadata was read; compressed payload data was not decompressed during inspection.",
      tarWrapped
        ? "Inner TAR entry names, types, paths, and sizes remain hidden until the conversion worker validates the decompressed stream."
        : "Complete stream integrity, expansion, and output validation remains in the conversion worker.",
    ],
    inspectedBytes,
    maximumInspectionBytes: MAX_COMPRESSION_HEADER_BYTES + 8,
    completeCentralDirectory: false,
  };
}

async function inspectSevenZipSource(file: File): Promise<PackageSourceInspection> {
  if (file.size < 32) throw new Error("7Z input is missing its start header.");
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const signature = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
  if (!signature.every((value, index) => header[index] === value)) {
    throw new Error("7Z input has an invalid signature.");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const nextOffset = view.getBigUint64(12, true);
  const nextSize = view.getBigUint64(20, true);
  const nextAbsolute = BigInt(32) + nextOffset;
  let inspectedBytes = header.byteLength;
  let encoding = "Unavailable within bounded header";
  if (nextAbsolute < BigInt(file.size) && nextAbsolute <= BigInt(Number.MAX_SAFE_INTEGER)) {
    const marker = new Uint8Array(
      await file.slice(Number(nextAbsolute), Number(nextAbsolute) + 1).arrayBuffer(),
    );
    inspectedBytes += marker.byteLength;
    encoding = marker[0] === 0x01 ? "Plain header" : marker[0] === 0x17 ? "Encoded header (compressed or encrypted)" : `Header marker ${marker[0]}`;
  }
  return {
    structure: archiveStructures.sevenzip,
    facts: [
      { label: "Format version", value: `${header[6]}.${header[7]}` },
      { label: "Next-header bytes", value: nextSize.toString() },
      { label: "Next-header offset", value: nextOffset.toString() },
      { label: "Header encoding", value: encoding },
      { label: "Start-header CRC", value: "Present; verified during conversion" },
    ],
    notes: [
      "Only the fixed start header and one next-header marker byte were read; archive payloads and embedded names were not read or displayed.",
      "Complete header, encryption, path, entry, expansion, and payload validation remains in the fixed-memory conversion worker.",
    ],
    inspectedBytes,
    maximumInspectionBytes: 33,
    completeCentralDirectory: false,
  };
}

export async function inspectPackageSource(
  file: File,
  format: string,
): Promise<PackageSourceInspection | null> {
  if (!supportedFormats.has(format)) return null;
  if (format === "tar") return inspectTarSource(file);
  if (format === "sevenzip") return inspectSevenZipSource(file);
  if (
    format === "bzip2" ||
    format === "gzip" ||
    format === "tar-bz2" ||
    format === "tar-gz" ||
    format === "tar-xz" ||
    format === "xz"
  ) {
    return inspectCompressionSource(file, format);
  }
  if (file.size < 22) {
    throw new Error("ZIP package is missing its end-of-central-directory record.");
  }

  const tailBytes = Math.min(file.size, MAX_PACKAGE_TAIL_BYTES);
  const tailStart = file.size - tailBytes;
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
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
    throw new Error("ZIP package has an invalid end-of-central-directory record.");
  }

  const disk = readU16(tail, endOffset + 4);
  const directoryDisk = readU16(tail, endOffset + 6);
  const diskEntries = readU16(tail, endOffset + 8);
  const declaredEntries = readU16(tail, endOffset + 10);
  const declaredDirectoryBytes = readU32(tail, endOffset + 12);
  const directoryOffset = readU32(tail, endOffset + 16);
  const zip64 =
    declaredEntries === 0xffff ||
    declaredDirectoryBytes === 0xffff_ffff ||
    directoryOffset === 0xffff_ffff;
  const multiDisk = disk !== 0 || directoryDisk !== 0 || diskEntries !== declaredEntries;
  const structure = structures[format] ?? "ZIP package";

  if (zip64 || multiDisk) {
    return {
      structure,
      facts: [
        { label: "Directory layout", value: zip64 ? "ZIP64" : "Multi-disk ZIP" },
        {
          label: "Conversion support",
          value: "Rejected by the current bounded conversion worker",
        },
      ],
      notes: [
        "Only the fixed ZIP tail was inspected; this package layout requires no payload read to identify as unsupported.",
        "Archive payloads, embedded XML, and entry contents were not decompressed or read.",
      ],
      inspectedBytes: tail.byteLength,
      maximumInspectionBytes: MAX_PACKAGE_INSPECTION_BYTES,
      completeCentralDirectory: false,
    };
  }

  const absoluteEndOffset = tailStart + endOffset;
  if (directoryOffset + declaredDirectoryBytes > absoluteEndOffset) {
    throw new Error("ZIP package central-directory bounds are invalid.");
  }

  const directoryReadBytes = Math.min(
    declaredDirectoryBytes,
    MAX_PACKAGE_DIRECTORY_BYTES,
  );
  let directory: Uint8Array;
  let inspectedBytes = tail.byteLength;
  if (
    directoryOffset >= tailStart &&
    directoryOffset + directoryReadBytes <= tailStart + tail.byteLength
  ) {
    const start = directoryOffset - tailStart;
    directory = tail.subarray(start, start + directoryReadBytes);
  } else {
    directory = new Uint8Array(
      await file
        .slice(directoryOffset, directoryOffset + directoryReadBytes)
        .arrayBuffer(),
    );
    inspectedBytes += directory.byteLength;
  }

  const names = new Set<string>();
  let parsedEntries = 0;
  let offset = 0;
  let totalUncompressed = 0;
  let encryptedEntries = 0;
  let unsafePaths = 0;
  let duplicateNames = 0;
  let storedEntries = 0;
  let deflatedEntries = 0;
  let otherMethods = 0;
  while (parsedEntries < declaredEntries && offset + 46 <= directory.byteLength) {
    if (readU32(directory, offset) !== 0x02014b50) {
      if (declaredDirectoryBytes <= MAX_PACKAGE_DIRECTORY_BYTES) {
        throw new Error("ZIP package central directory is malformed.");
      }
      break;
    }
    const flags = readU16(directory, offset + 8);
    const method = readU16(directory, offset + 10);
    const uncompressedSize = readU32(directory, offset + 24);
    const nameLength = readU16(directory, offset + 28);
    const extraLength = readU16(directory, offset + 30);
    const commentLength = readU16(directory, offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > directory.byteLength) break;
    const name = decodeEntryName(directory.subarray(offset + 46, offset + 46 + nameLength));
    if (names.has(name)) duplicateNames += 1;
    names.add(name);
    if (unsafeEntryPath(name)) unsafePaths += 1;
    if ((flags & 0x0001) !== 0) encryptedEntries += 1;
    if (method === 0) storedEntries += 1;
    else if (method === 8) deflatedEntries += 1;
    else otherMethods += 1;
    totalUncompressed += uncompressedSize;
    parsedEntries += 1;
    offset = next;
  }

  const completeCentralDirectory =
    declaredDirectoryBytes <= MAX_PACKAGE_DIRECTORY_BYTES &&
    parsedEntries === declaredEntries &&
    offset === directory.byteLength;
  if (declaredDirectoryBytes <= MAX_PACKAGE_DIRECTORY_BYTES && !completeCentralDirectory) {
    throw new Error("ZIP package central directory is truncated or malformed.");
  }
  const reviewedSignal = (count: number) =>
    completeCentralDirectory
      ? count.toLocaleString("en-US")
      : `${count.toLocaleString("en-US")} found in ${parsedEntries.toLocaleString("en-US")} inspected entries (${declaredEntries.toLocaleString("en-US")} declared)`;

  const facts: PackageSourceFact[] = [
    {
      label: "Declared entries",
      value: declaredEntries.toLocaleString("en-US"),
    },
    {
      label: "Inspected entries",
      value: exactOrLowerBound(parsedEntries, completeCentralDirectory, declaredEntries),
    },
    {
      label: "Declared directory bytes",
      value: declaredDirectoryBytes.toLocaleString("en-US"),
    },
    {
      label: completeCentralDirectory
        ? "Declared uncompressed bytes"
        : "Inspected declared uncompressed bytes",
      value: completeCentralDirectory
        ? totalUncompressed.toLocaleString("en-US")
        : `At least ${totalUncompressed.toLocaleString("en-US")}`,
    },
    {
      label: "Compression methods",
      value: `${storedEntries.toLocaleString("en-US")} stored, ${deflatedEntries.toLocaleString("en-US")} deflated, ${otherMethods.toLocaleString("en-US")} other`,
    },
    {
      label: "Encrypted entries",
      value: reviewedSignal(encryptedEntries),
    },
    {
      label: "Unsafe entry paths",
      value: reviewedSignal(unsafePaths),
    },
    {
      label: "Duplicate entry names",
      value: reviewedSignal(duplicateNames),
    },
    ...markerFacts(format, names, completeCentralDirectory),
  ];

  return {
    structure,
    facts,
    notes: [
      completeCentralDirectory
        ? "The complete classic ZIP central directory fit inside the fixed inspection ceiling."
        : "Only the fixed-size central-directory prefix was inspected; entry totals and package markers may be lower bounds.",
      "Archive payloads, embedded XML, and entry contents were not decompressed, displayed, retained, or uploaded.",
      unsafePaths > 0 || encryptedEntries > 0 || otherMethods > 0
        ? "Potentially unsafe, encrypted, or unsupported entries remain subject to complete conversion-worker validation."
        : "Complete path, encryption, compression, and package validation remains in the conversion worker.",
    ],
    inspectedBytes,
    maximumInspectionBytes: MAX_PACKAGE_INSPECTION_BYTES,
    completeCentralDirectory,
  };
}
