export const MAX_PACKAGE_DIRECTORY_BYTES = 1024 * 1024;
export const MAX_PACKAGE_TAIL_BYTES = 65_557;
export const MAX_PACKAGE_INSPECTION_BYTES =
  MAX_PACKAGE_TAIL_BYTES + MAX_PACKAGE_DIRECTORY_BYTES;

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
  "docx",
  "epub",
  "odp",
  "ods",
  "odt",
  "pptx",
  "xlsx",
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

export async function inspectPackageSource(
  file: File,
  format: string,
): Promise<PackageSourceInspection | null> {
  if (!supportedFormats.has(format)) return null;
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
