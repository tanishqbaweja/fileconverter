import type { ConversionMetrics } from "../lib/conversion-protocol";
import {
  createZipCentralHeader,
  createZipDataDescriptor,
  createZipEndRecord,
  createZipLocalHeader,
  ensureZip32,
  unixToDos,
  updateCrc32,
  type WrittenZipEntry,
} from "./archive-conversion";

const IO_CHUNK_BYTES = 256 * 1024;
const MAX_LINE_CHARS = 1024 * 1024;

interface DocumentRuntime {
  file: File;
  profileId:
    | "txt-to-html"
    | "txt-to-docx"
    | "txt-to-odt"
    | "txt-to-epub"
    | "md-to-html"
    | "md-to-epub"
    | "html-to-txt";
  metrics: ConversionMetrics;
  write(chunk: Uint8Array<ArrayBuffer>, phase: string): Promise<void>;
  warn(message: string): void;
  assertActive(): void;
  progress(phase: string): void;
}

export async function runDocumentConversion(
  runtime: DocumentRuntime,
): Promise<void> {
  if (runtime.profileId === "txt-to-html") {
    await textToHtml(runtime);
  } else if (runtime.profileId === "txt-to-docx") {
    await textToDocx(runtime);
  } else if (runtime.profileId === "txt-to-odt") {
    await textToOdt(runtime);
  } else if (runtime.profileId === "txt-to-epub") {
    await textToEpub(runtime);
  } else if (runtime.profileId === "md-to-html") {
    await markdownToHtml(runtime);
  } else if (runtime.profileId === "md-to-epub") {
    await markdownToEpub(runtime);
  } else {
    await htmlToText(runtime);
  }
  runtime.metrics.inputBytes = runtime.file.size;
}

const DOCX_CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";
const DOCX_RELATIONSHIPS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";
const DOCX_DOCUMENT_PREFIX =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const DOCX_DOCUMENT_SUFFIX = "<w:sectPr/></w:body></w:document>";
const ODT_MIMETYPE = "application/vnd.oasis.opendocument.text";
const ODT_MANIFEST =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
  '<manifest:file-entry manifest:full-path="/" manifest:media-type="' +
  ODT_MIMETYPE +
  '"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
  "</manifest:manifest>";
const ODT_CONTENT_PREFIX =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">' +
  "<office:body><office:text>";
const ODT_CONTENT_SUFFIX =
  "</office:text></office:body></office:document-content>";
const EPUB_MIMETYPE = "application/epub+zip";
const EPUB_CONTAINER =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
  '<rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
  "</container>";
const EPUB_IDENTIFIER_CHUNK_BYTES = 16 * 1024 * 1024;

async function textToDocx(runtime: DocumentRuntime): Promise<void> {
  runtime.warn(
    "Plain-text lines become Word paragraphs and tabs become Word tab elements. DOCX cannot infer headings, styles, links, tables, page layout, language, or document metadata from plain text.",
  );
  runtime.warn(
    "The bounded profile streams standards-compliant DEFLATE entries directly into the DOCX package without retaining completed XML or ZIP data.",
  );
  const entries: WrittenZipEntry[] = [];
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "[Content_Types].xml",
    async (write) => write(new TextEncoder().encode(DOCX_CONTENT_TYPES)),
  );
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "_rels/.rels",
    async (write) => write(new TextEncoder().encode(DOCX_RELATIONSHIPS)),
  );
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "word/document.xml",
    async (write) => {
      const writer = createZipTextWriter(write);
      await writer.write(DOCX_DOCUMENT_PREFIX);
      await writeDocumentParagraphs(runtime, writer, wordParagraph);
      await writer.write(DOCX_DOCUMENT_SUFFIX);
      await writer.flush();
    },
  );

  await finishDocumentPackage(runtime, entries, "DOCX");
}

async function textToOdt(runtime: DocumentRuntime): Promise<void> {
  runtime.warn(
    "Plain-text lines become OpenDocument paragraphs and tabs become text:tab elements. ODT cannot infer headings, styles, links, tables, page layout, language, or document metadata from plain text.",
  );
  runtime.warn(
    "The ODF 1.3 package writes its required uncompressed mimetype entry first, then streams manifest and content XML through bounded raw DEFLATE without retaining completed XML or ZIP data.",
  );
  const entries: WrittenZipEntry[] = [];
  await writeStoredMimetypeEntry(runtime, entries, ODT_MIMETYPE, "ODT");
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "META-INF/manifest.xml",
    async (write) => write(new TextEncoder().encode(ODT_MANIFEST)),
  );
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "content.xml",
    async (write) => {
      const writer = createZipTextWriter(write);
      await writer.write(ODT_CONTENT_PREFIX);
      await writeDocumentParagraphs(runtime, writer, odtParagraph);
      await writer.write(ODT_CONTENT_SUFFIX);
      await writer.flush();
    },
  );
  await finishDocumentPackage(runtime, entries, "ODT");
}

async function textToEpub(runtime: DocumentRuntime): Promise<void> {
  runtime.warn(
    "Plain text becomes one reflowable EPUB 3.3 XHTML document. Whitespace and Unicode text are preserved in a preformatted block, but headings, chapters, language, links, styling, cover art, and book metadata cannot be inferred.",
  );
  runtime.warn(
    "The EPUB container writes its required uncompressed mimetype entry first, then streams container metadata, navigation, content, and package metadata through bounded raw DEFLATE without retaining completed XHTML or ZIP data. A bounded content hash provides a persistent publication UUID.",
  );
  await writeEpubPackage(runtime, "Converted text", async (writer) => {
    await writer.write("<pre>");
    const identifier = await writeEscapedDocumentText(runtime, writer);
    await writer.write("</pre>");
    return identifier;
  });
}

async function markdownToEpub(runtime: DocumentRuntime): Promise<void> {
  runtime.warn(
    "This bounded Markdown-to-EPUB profile preserves headings, paragraphs, lists, blockquotes, fenced code, safe links, emphasis, strong text, inline code, and rules in one reflowable XHTML spine document. Extensions and raw HTML are emitted as text.",
  );
  runtime.warn(
    "The EPUB 3.3 package streams its required mimetype, container metadata, navigation, rendered XHTML, and package metadata with one bounded output operation. A same-pass bounded content hash provides a persistent publication UUID.",
  );
  await writeEpubPackage(runtime, "Converted Markdown", async (writer) => {
    const identifier = createEpubIdentifierHasher(runtime.metrics);
    try {
      await renderMarkdownBody(runtime, writer, {
        xhtml: true,
        onChunk: (chunk) => identifier.update(chunk),
      });
      return await identifier.finish();
    } finally {
      runtime.metrics.codecWorkingBytes = 0;
    }
  });
}

async function writeEpubPackage(
  runtime: DocumentRuntime,
  title: string,
  renderBody: (
    writer: ReturnType<typeof createZipTextWriter>,
  ) => Promise<string>,
): Promise<void> {
  const entries: WrittenZipEntry[] = [];
  await writeStoredMimetypeEntry(runtime, entries, EPUB_MIMETYPE, "EPUB");
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "META-INF/container.xml",
    async (write) => write(new TextEncoder().encode(EPUB_CONTAINER)),
  );
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "EPUB/nav.xhtml",
    async (write) => {
      const safeTitle = escapeXml(title);
      const navigation =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="und">' +
        '<head><meta charset="utf-8"/><title>Contents</title></head>' +
        '<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="content.xhtml">' +
        safeTitle +
        "</a></li></ol></nav></body></html>";
      await write(new TextEncoder().encode(navigation));
    },
  );
  let identifier = "";
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "EPUB/content.xhtml",
    async (write) => {
      const writer = createZipTextWriter(write);
      await writer.write(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="und">' +
          '<head><meta charset="utf-8"/><title>' +
          escapeXml(title) +
          "</title></head><body>",
      );
      identifier = await renderBody(writer);
      await writer.write("</body></html>");
      await writer.flush();
    },
  );
  await writeDeflatedPackageEntry(
    runtime,
    entries,
    "EPUB/package.opf",
    async (write) => {
      const modified = new Date(runtime.file.lastModified)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
      const packageDocument =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="und">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:identifier id="pub-id">' +
        identifier +
        "</dc:identifier>" +
        "<dc:title>" +
        escapeXml(title) +
        "</dc:title><dc:language>und</dc:language>" +
        '<meta property="dcterms:modified">' +
        modified +
        "</meta></metadata>" +
        '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
        '<item id="content" href="content.xhtml" media-type="application/xhtml+xml"/></manifest>' +
        '<spine><itemref idref="content"/></spine></package>';
      await write(new TextEncoder().encode(packageDocument));
    },
  );
  await finishDocumentPackage(runtime, entries, "EPUB");
}

async function writeStoredMimetypeEntry(
  runtime: DocumentRuntime,
  entries: WrittenZipEntry[],
  mimetype: string,
  label: string,
): Promise<void> {
  if (runtime.metrics.outputBytes !== 0) {
    throw new Error(label + " mimetype must be the first package entry.");
  }
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode("mimetype");
  const payload = encoder.encode(mimetype);
  const flags = 0x0800;
  const method = 0;
  const { dosTime, dosDate } = unixToDos(0);
  const crc32 = (updateCrc32(0xffff_ffff, payload) ^ 0xffff_ffff) >>> 0;
  const header = createZipLocalHeader(
    nameBytes,
    flags,
    method,
    dosTime,
    dosDate,
  );
  const view = new DataView(header.buffer);
  view.setUint32(14, crc32, true);
  view.setUint32(18, payload.byteLength, true);
  view.setUint32(22, payload.byteLength, true);
  await writePackageChunk(
    runtime,
    header,
    "Writing " + label + " mimetype header",
  );
  await writePackageChunk(runtime, payload, "Writing " + label + " mimetype");
  entries.push({
    nameBytes,
    directory: false,
    method,
    flags,
    dosTime,
    dosDate,
    crc32,
    compressedSize: payload.byteLength,
    uncompressedSize: payload.byteLength,
    localHeaderOffset: 0,
  });
}

async function writeEscapedDocumentText(
  runtime: DocumentRuntime,
  writer: ReturnType<typeof createZipTextWriter>,
): Promise<string> {
  const reader = boundedBlobStream(runtime.file, runtime).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const identifier = createEpubIdentifierHasher(runtime.metrics);
  let first = true;
  let completed = false;
  try {
    for (;;) {
      runtime.assertActive();
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      await identifier.update(value);
      let text = decoder.decode(value, { stream: true });
      if (first) {
        text = text.replace(/^\uFEFF/, "");
        first = false;
      }
      assertXmlText(text);
      await writer.write(escapeEpubText(text));
    }
    const tail = decoder.decode();
    assertXmlText(tail);
    await writer.write(escapeEpubText(tail));
    return await identifier.finish();
  } finally {
    runtime.metrics.codecWorkingBytes = 0;
    if (!completed) await reader.cancel().catch(() => {});
  }
}

function createEpubIdentifierHasher(metrics: ConversionMetrics) {
  const buffer = new Uint8Array(32 + EPUB_IDENTIFIER_CHUNK_BYTES + 8);
  metrics.codecWorkingBytes = buffer.byteLength;
  metrics.peakCodecWorkingBytes = Math.max(
    metrics.peakCodecWorkingBytes ?? 0,
    buffer.byteLength,
  );
  let state = new Uint8Array(32);
  let used = 0;
  let total = 0;

  const digestBlock = async (includeLength: boolean) => {
    buffer.set(state, 0);
    let length = 32 + used;
    if (includeLength) {
      new DataView(buffer.buffer).setBigUint64(length, BigInt(total), true);
      length += 8;
    }
    state = new Uint8Array(
      await crypto.subtle.digest("SHA-256", buffer.subarray(0, length)),
    );
    used = 0;
  };

  return {
    async update(chunk: Uint8Array<ArrayBuffer>) {
      let offset = 0;
      total += chunk.byteLength;
      while (offset < chunk.byteLength) {
        const take = Math.min(
          EPUB_IDENTIFIER_CHUNK_BYTES - used,
          chunk.byteLength - offset,
        );
        buffer.set(chunk.subarray(offset, offset + take), 32 + used);
        offset += take;
        used += take;
        if (used === EPUB_IDENTIFIER_CHUNK_BYTES) await digestBlock(false);
      }
    },
    async finish() {
      await digestBlock(true);
      const uuid = state.slice(0, 16);
      uuid[6] = (uuid[6] & 0x0f) | 0x80;
      uuid[8] = (uuid[8] & 0x3f) | 0x80;
      const hex = Array.from(uuid, (byte) => byte.toString(16).padStart(2, "0"));
      return (
        "urn:uuid:" +
        hex.slice(0, 4).join("") +
        "-" +
        hex.slice(4, 6).join("") +
        "-" +
        hex.slice(6, 8).join("") +
        "-" +
        hex.slice(8, 10).join("") +
        "-" +
        hex.slice(10).join("")
      );
    },
  };
}

async function finishDocumentPackage(
  runtime: DocumentRuntime,
  entries: WrittenZipEntry[],
  label: string,
): Promise<void> {
  const directoryOffset = runtime.metrics.outputBytes;
  ensureZip32(directoryOffset, label + " central-directory offset");
  for (const entry of entries) {
    await writePackageChunk(
      runtime,
      createZipCentralHeader(entry),
      "Writing " + label + " directory",
    );
  }
  const directorySize = runtime.metrics.outputBytes - directoryOffset;
  ensureZip32(directorySize, label + " central-directory size");
  await writePackageChunk(
    runtime,
    createZipEndRecord(entries.length, directorySize, directoryOffset),
    "Finalizing " + label,
  );
}

async function writeDeflatedPackageEntry(
  runtime: DocumentRuntime,
  entries: WrittenZipEntry[],
  name: string,
  produce: (
    write: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  const nameBytes = new TextEncoder().encode(name);
  if (nameBytes.byteLength < 1 || nameBytes.byteLength > 65_535) {
    throw new Error("A document package entry name exceeds the ZIP32 limit.");
  }
  const flags = 0x0808;
  const method = 8;
  const { dosTime, dosDate } = unixToDos(0);
  const localHeaderOffset = runtime.metrics.outputBytes;
  ensureZip32(localHeaderOffset, "document package local-header offset");
  await writePackageChunk(
    runtime,
    createZipLocalHeader(nameBytes, flags, method, dosTime, dosDate),
    "Writing document package header",
  );

  const payload = await deflatePackageEntry(runtime, produce);
  await writePackageChunk(
    runtime,
    createZipDataDescriptor(
      payload.crc32,
      payload.compressedSize,
      payload.uncompressedSize,
    ),
    "Writing document package descriptor",
  );
  entries.push({
    nameBytes,
    directory: false,
    method,
    flags,
    dosTime,
    dosDate,
    crc32: payload.crc32,
    compressedSize: payload.compressedSize,
    uncompressedSize: payload.uncompressedSize,
    localHeaderOffset,
  });
}

async function deflatePackageEntry(
  runtime: DocumentRuntime,
  produce: (
    write: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
  ) => Promise<void>,
): Promise<{ crc32: number; compressedSize: number; uncompressedSize: number }> {
  const codec = new CompressionStream("deflate-raw" as CompressionFormat);
  const writer = codec.writable.getWriter();
  const reader = codec.readable.getReader();
  let crc = 0xffff_ffff;
  let compressedSize = 0;
  let uncompressedSize = 0;
  let pumpFailure: unknown = null;
  const pump = (async () => {
    try {
      for (;;) {
        runtime.assertActive();
        const { done, value } = await reader.read();
        if (done) return;
        compressedSize += value.byteLength;
        ensureZip32(compressedSize, "document package compressed entry size");
        await writePackageChunk(runtime, value, "Writing document package content");
      }
    } catch (error) {
      pumpFailure = error;
      await reader.cancel(error).catch(() => {});
    }
  })();

  try {
    await produce(async (chunk) => {
      runtime.assertActive();
      if (!chunk.byteLength) return;
      uncompressedSize += chunk.byteLength;
      ensureZip32(uncompressedSize, "document package entry size");
      crc = updateCrc32(crc, chunk);
      if (pumpFailure) throw pumpFailure;
      await writer.write(chunk);
      if (pumpFailure) throw pumpFailure;
    });
    await writer.close();
    await pump;
    if (pumpFailure) throw pumpFailure;
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await reader.cancel(error).catch(() => {});
    await pump;
    throw pumpFailure ?? error;
  }

  return {
    crc32: (crc ^ 0xffff_ffff) >>> 0,
    compressedSize,
    uncompressedSize,
  };
}

async function writePackageChunk(
  runtime: DocumentRuntime,
  chunk: Uint8Array<ArrayBuffer>,
  phase: string,
): Promise<void> {
  ensureZip32(
    runtime.metrics.outputBytes + chunk.byteLength,
    "document package output size",
  );
  await runtime.write(chunk, phase);
  runtime.progress(phase);
}

function createZipTextWriter(
  write: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    await write(buffer.slice(0, used));
    used = 0;
  };
  return {
    async write(value: string) {
      let remaining = value;
      while (remaining) {
        const result = encoder.encodeInto(remaining, buffer.subarray(used));
        used += result.written;
        remaining = remaining.slice(result.read);
        if (used === buffer.byteLength) await flush();
        if (result.read === 0 && result.written === 0) await flush();
      }
    },
    flush,
  };
}

function wordParagraph(line: string): string {
  assertXmlText(line);
  if (!line) return "<w:p/>";
  if (!line.includes("\t")) {
    return (
      '<w:p><w:r><w:t xml:space="preserve">' +
      escapeXml(line) +
      "</w:t></w:r></w:p>"
    );
  }
  const pieces = line.split("\t");
  let output = "<w:p>";
  for (let index = 0; index < pieces.length; index += 1) {
    if (index > 0) output += "<w:r><w:tab/></w:r>";
    if (pieces[index]) {
      output += `<w:r><w:t xml:space="preserve">${escapeXml(pieces[index])}</w:t></w:r>`;
    }
  }
  return `${output}</w:p>`;
}

function odtParagraph(line: string): string {
  assertXmlText(line);
  if (!line) return "<text:p/>";
  let output = "<text:p>";
  let cursor = 0;
  let index = 0;
  while (index < line.length) {
    if (line[index] === "\t") {
      output += escapeXml(line.slice(cursor, index));
      output += "<text:tab/>";
      index += 1;
      cursor = index;
      continue;
    }
    if (line[index] !== " ") {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < line.length && line[end] === " ") end += 1;
    const count = end - index;
    if (index === 0 || end === line.length || count > 1) {
      output += escapeXml(line.slice(cursor, index));
      output += count === 1
        ? "<text:s/>"
        : '<text:s text:c="' + String(count) + '"/>';
      cursor = end;
    }
    index = end;
  }
  output += escapeXml(line.slice(cursor));
  return output + "</text:p>";
}

const XML_FORBIDDEN_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/;

function assertXmlText(value: string): void {
  if (XML_FORBIDDEN_TEXT.test(value)) {
    throw new Error("Plain text contains a character forbidden by XML 1.0.");
  }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (character) =>
    character === "&" ? "&amp;" : character === "<" ? "&lt;" : "&gt;",
  );
}

function escapeEpubText(value: string): string {
  return escapeXml(value).replace(/\r/g, "&#13;");
}

async function writeDocumentParagraphs(
  runtime: DocumentRuntime,
  writer: ReturnType<typeof createZipTextWriter>,
  createParagraph: (line: string) => string,
): Promise<void> {
  const reader = boundedBlobStream(runtime.file, runtime).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
  let batch = "";
  let first = true;
  let completed = false;
  const appendLine = (line: string): Promise<void> | null => {
    if (line.length > MAX_LINE_CHARS) {
      throw new Error("A document line exceeds the 1 MiB safety limit.");
    }
    batch += createParagraph(line);
    if (batch.length >= IO_CHUNK_BYTES) {
      const pending = writer.write(batch);
      batch = "";
      return pending;
    }
    return null;
  };

  try {
    for (;;) {
      runtime.assertActive();
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      let text = decoder.decode(value, { stream: true });
      if (first) {
        text = text.replace(/^\uFEFF/, "");
        first = false;
      }
      carry += text;
      let newline = carry.indexOf("\n");
      while (newline >= 0) {
        const line = carry.slice(0, newline).replace(/\r$/, "");
        carry = carry.slice(newline + 1);
        const pending = appendLine(line);
        if (pending) await pending;
        newline = carry.indexOf("\n");
      }
      if (carry.length > MAX_LINE_CHARS) {
        throw new Error("A document line exceeds the 1 MiB safety limit.");
      }
    }
    carry += decoder.decode();
    if (carry) {
      const pending = appendLine(carry.replace(/\r$/, ""));
      if (pending) await pending;
    }
    if (batch) await writer.write(batch);
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
  }
}

async function textToHtml(runtime: DocumentRuntime): Promise<void> {
  const writer = createWriter(runtime, "Writing HTML");
  await writer.write(
    '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Converted text</title></head>\n<body><pre>',
  );
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = boundedBlobStream(runtime.file, runtime).getReader();
  let first = true;
  for (;;) {
    runtime.assertActive();
    const { done, value } = await reader.read();
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    if (first) {
      text = text.replace(/^\uFEFF/, "");
      first = false;
    }
    await writer.write(escapeHtml(text));
  }
  await writer.write(`${escapeHtml(decoder.decode())}</pre></body>\n</html>\n`);
  await writer.flush();
}

async function markdownToHtml(runtime: DocumentRuntime): Promise<void> {
  runtime.warn(
    "This bounded Markdown profile implements headings, paragraphs, lists, blockquotes, fenced code, links, emphasis, strong text, inline code, and rules; extensions and raw HTML are emitted as text.",
  );
  const writer = createWriter(runtime, "Rendering Markdown");
  await writer.write(
    '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Converted Markdown</title></head>\n<body>\n',
  );
  await renderMarkdownBody(runtime, writer, { xhtml: false });
  await writer.write("</body>\n</html>\n");
  await writer.flush();
}

interface MarkdownRenderOptions {
  xhtml: boolean;
  onChunk?: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>;
}

async function renderMarkdownBody(
  runtime: DocumentRuntime,
  writer: { write(value: string): Promise<void> },
  options: MarkdownRenderOptions,
): Promise<void> {
  let paragraph: string[] = [];
  let paragraphChars = 0;
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let codeLanguage = "";
  let outputBatch = "";

  const emit = (value: string): Promise<void> | null => {
    if (outputBatch && outputBatch.length + value.length > IO_CHUNK_BYTES) {
      const pending = writer.write(outputBatch);
      outputBatch = "";
      if (value.length >= IO_CHUNK_BYTES) {
        return pending.then(() => writer.write(value));
      }
      outputBatch = value;
      return pending;
    }
    if (value.length >= IO_CHUNK_BYTES) {
      return writer.write(value);
    }
    outputBatch += value;
    return null;
  };

  const closeParagraph = (): Promise<void> | null => {
    if (!paragraph.length) return null;
    const pending = emit(`<p>${renderMarkdownInline(paragraph.join(" "))}</p>\n`);
    paragraph = [];
    paragraphChars = 0;
    return pending;
  };
  const closeList = (): Promise<void> | null => {
    if (!list) return null;
    const pending = emit(`</${list}>\n`);
    list = null;
    return pending;
  };

  for await (const line of readLines(runtime, options.onChunk)) {
    runtime.assertActive();
    if (options.xhtml) assertXmlText(line);
    if (inCode) {
      if (/^ {0,3}```\s*$/.test(line)) {
        const pending = emit("</code></pre>\n");
        if (pending) await pending;
        inCode = false;
        codeLanguage = "";
      } else {
        const pending = emit(`${escapeHtml(line)}\n`);
        if (pending) await pending;
      }
      continue;
    }
    const fence = line.match(/^ {0,3}```\s*([A-Za-z0-9_+-]*)\s*$/);
    if (fence) {
      let pending = closeParagraph();
      if (pending) await pending;
      pending = closeList();
      if (pending) await pending;
      inCode = true;
      codeLanguage = fence[1];
      pending = emit(
        `<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""}>`,
      );
      if (pending) await pending;
      continue;
    }
    if (!line.trim()) {
      let pending = closeParagraph();
      if (pending) await pending;
      pending = closeList();
      if (pending) await pending;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      let pending = closeParagraph();
      if (pending) await pending;
      pending = closeList();
      if (pending) await pending;
      const level = heading[1].length;
      pending = emit(
        `<h${level}>${renderMarkdownInline(heading[2])}</h${level}>\n`,
      );
      if (pending) await pending;
      continue;
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      let pending = closeParagraph();
      if (pending) await pending;
      pending = closeList();
      if (pending) await pending;
      pending = emit(options.xhtml ? "<hr/>\n" : "<hr>\n");
      if (pending) await pending;
      continue;
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      let pending = closeParagraph();
      if (pending) await pending;
      const nextList = unordered ? "ul" : "ol";
      if (list !== nextList) {
        pending = closeList();
        if (pending) await pending;
        list = nextList;
        pending = emit(`<${list}>\n`);
        if (pending) await pending;
      }
      pending = emit(
        `<li>${renderMarkdownInline((unordered ?? ordered)?.[1] ?? "")}</li>\n`,
      );
      if (pending) await pending;
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      let pending = closeParagraph();
      if (pending) await pending;
      pending = closeList();
      if (pending) await pending;
      pending = emit(
        `<blockquote><p>${renderMarkdownInline(quote[1])}</p></blockquote>\n`,
      );
      if (pending) await pending;
      continue;
    }
    const pending = closeList();
    if (pending) await pending;
    const part = line.trim();
    paragraph.push(part);
    paragraphChars += part.length;
    if (paragraphChars > MAX_LINE_CHARS) {
      throw new Error("A Markdown paragraph exceeds the 1 MiB safety limit.");
    }
  }
  if (inCode) throw new Error("Markdown input ends inside a fenced code block.");
  let pending = closeParagraph();
  if (pending) await pending;
  pending = closeList();
  if (pending) await pending;
  if (outputBatch) await writer.write(outputBatch);
}

function renderMarkdownInline(value: string): string {
  const tokens: string[] = [];
  const protect = (html: string) => {
    const index = tokens.push(html) - 1;
    return `\u0000${index}\u0000`;
  };
  let output = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    protect(`<code>${escapeHtml(code)}</code>`),
  );
  output = output.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, href: string) => {
      const safeHref = safeLink(href);
      return safeHref
        ? protect(
            `<a href="${escapeHtml(safeHref)}" rel="noreferrer">${escapeHtml(label)}</a>`,
          )
        : label;
    },
  );
  output = escapeHtml(output);
  output = output
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
  return output.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => {
    const token = tokens[Number(index)];
    if (token == null) throw new Error("Markdown inline token is invalid.");
    return token;
  });
}

function safeLink(value: string): string | null {
  const decoded = decodeURIComponentSafely(value).trim();
  if (XML_FORBIDDEN_TEXT.test(decoded)) return null;
  if (
    decoded.startsWith("#") ||
    decoded.startsWith("/") ||
    decoded.startsWith("./") ||
    decoded.startsWith("../") ||
    /^(?:https?:|mailto:)/i.test(decoded)
  ) {
    return decoded;
  }
  return null;
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function htmlToText(runtime: DocumentRuntime): Promise<void> {
  runtime.warn(
    "This bounded HTML profile emits visible text and common list structure; scripts, styles, templates, metadata, layout, images, and form controls are removed.",
  );
  const writer = createWriter(runtime, "Extracting HTML text");
  let hiddenDepth = 0;
  let lineStart = true;
  let pendingSpace = false;

  const newline = async () => {
    if (!lineStart) await writer.write("\n");
    lineStart = true;
    pendingSpace = false;
  };
  const appendText = async (value: string) => {
    const decoded = decodeHtmlEntities(value);
    const normalized = decoded.replace(/\s+/g, " ").trim();
    if (!normalized) {
      if (!lineStart) pendingSpace = true;
      return;
    }
    if (pendingSpace && !lineStart) await writer.write(" ");
    await writer.write(normalized);
    lineStart = false;
    pendingSpace = true;
  };

  for await (const token of readHtmlTokens(runtime)) {
    runtime.assertActive();
    if (token.kind === "text") {
      if (!hiddenDepth) await appendText(token.value);
      continue;
    }
    if (token.kind !== "tag") continue;
    const parsed = parseHtmlTag(token.value);
    if (!parsed) continue;
    const hidden = new Set([
      "head",
      "script",
      "style",
      "template",
      "noscript",
      "svg",
      "canvas",
    ]);
    if (!parsed.closing && !parsed.selfClosing && hidden.has(parsed.name)) {
      hiddenDepth += 1;
      continue;
    }
    if (parsed.closing && hidden.has(parsed.name)) {
      hiddenDepth = Math.max(0, hiddenDepth - 1);
      continue;
    }
    if (hiddenDepth) continue;
    if (!parsed.closing && parsed.name === "li") {
      await newline();
      await writer.write("- ");
      lineStart = false;
      pendingSpace = false;
    } else if (
      parsed.name === "br" ||
      [
        "p",
        "div",
        "section",
        "article",
        "header",
        "footer",
        "main",
        "aside",
        "nav",
        "blockquote",
        "pre",
        "tr",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ].includes(parsed.name)
    ) {
      await newline();
    } else if (
      !parsed.closing &&
      (parsed.name === "td" || parsed.name === "th")
    ) {
      if (!lineStart) {
        await writer.write("\t");
        pendingSpace = false;
      }
    }
  }
  await newline();
  await writer.flush();
}

type HtmlToken =
  | { kind: "text" | "tag" | "comment" | "doctype"; value: string };

async function* readHtmlTokens(
  runtime: DocumentRuntime,
): AsyncGenerator<HtmlToken> {
  const reader = boundedBlobStream(runtime.file, runtime).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let first = true;
  let rawTextTag = "";

  const drain = function* (final: boolean): Generator<HtmlToken> {
    for (;;) {
      if (rawTextTag) {
        const match = new RegExp(`</\\s*${rawTextTag}\\s*>`, "i").exec(buffer);
        if (!match) {
          if (buffer.length > MAX_LINE_CHARS) {
            buffer = buffer.slice(-64);
          }
          if (final) {
            buffer = "";
            rawTextTag = "";
          }
          return;
        }
        buffer = buffer.slice((match.index ?? 0) + match[0].length);
        yield { kind: "tag", value: match[0] };
        rawTextTag = "";
        continue;
      }
      const opening = buffer.indexOf("<");
      if (opening < 0) {
        if (final && buffer) {
          yield { kind: "text", value: buffer };
          buffer = "";
        } else if (buffer.length > MAX_LINE_CHARS) {
          yield { kind: "text", value: buffer };
          buffer = "";
        }
        return;
      }
      if (opening > 0) {
        yield { kind: "text", value: buffer.slice(0, opening) };
        buffer = buffer.slice(opening);
        continue;
      }
      let end = -1;
      let kind: HtmlToken["kind"] = "tag";
      if (buffer.startsWith("<!--")) {
        end = buffer.indexOf("-->");
        if (end >= 0) end += 3;
        kind = "comment";
      } else {
        end = findTagEnd(buffer);
        if (/^<!doctype\b/i.test(buffer)) kind = "doctype";
      }
      if (end < 0) {
        if (buffer.length > MAX_LINE_CHARS) {
          throw new Error("An HTML tag exceeds the 1 MiB safety limit.");
        }
        if (final) throw new Error("HTML input ends inside markup.");
        return;
      }
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end);
      yield { kind, value: raw };
      const parsed = kind === "tag" ? parseHtmlTag(raw) : null;
      if (
        parsed &&
        !parsed.closing &&
        !parsed.selfClosing &&
        (parsed.name === "script" || parsed.name === "style")
      ) {
        rawTextTag = parsed.name;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    if (first) {
      text = text.replace(/^\uFEFF/, "");
      first = false;
    }
    buffer += text;
    yield* drain(false);
  }
  buffer += decoder.decode();
  yield* drain(true);
}

function parseHtmlTag(
  value: string,
): { name: string; closing: boolean; selfClosing: boolean } | null {
  const match = value.match(/^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9:-]*)[\s\S]*?>$/);
  if (!match) {
    if (/^<!|^<\?/.test(value)) return null;
    throw new Error("HTML contains malformed markup.");
  }
  return {
    name: match[2].toLowerCase(),
    closing: Boolean(match[1]),
    selfClosing: /\/\s*>$/.test(value),
  };
}

function findTagEnd(value: string): number {
  let quote = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return -1;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
  };
  const decoded = value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, body) => {
    const lower = String(body).toLowerCase();
    if (Object.hasOwn(named, lower)) return named[lower];
    const numeric = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : lower.startsWith("#")
        ? Number.parseInt(lower.slice(1), 10)
        : Number.NaN;
    if (
      !Number.isInteger(numeric) ||
      numeric < 0 ||
      numeric > 0x10ffff ||
      (numeric >= 0xd800 && numeric <= 0xdfff)
    ) {
      throw new Error(`Unsupported HTML entity: ${entity}`);
    }
    return String.fromCodePoint(numeric);
  });
  const unknown = decoded.match(/&[A-Za-z][A-Za-z0-9]+;/);
  if (unknown) throw new Error(`Unsupported HTML entity: ${unknown[0]}`);
  return decoded;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function* readLines(
  runtime: DocumentRuntime,
  onChunk?: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
): AsyncGenerator<string> {
  const reader = boundedBlobStream(runtime.file, runtime).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
  let first = true;
  let completed = false;
  try {
    for (;;) {
      runtime.assertActive();
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (onChunk) await onChunk(value);
      let text = decoder.decode(value, { stream: true });
      if (first) {
        text = text.replace(/^\uFEFF/, "");
        first = false;
      }
      carry += text;
      let newline = carry.indexOf("\n");
      while (newline >= 0) {
        const line = carry.slice(0, newline).replace(/\r$/, "");
        carry = carry.slice(newline + 1);
        if (line.length > MAX_LINE_CHARS) {
          throw new Error("A document line exceeds the 1 MiB safety limit.");
        }
        yield line;
        newline = carry.indexOf("\n");
      }
      if (carry.length > MAX_LINE_CHARS) {
        throw new Error("A document line exceeds the 1 MiB safety limit.");
      }
    }
    carry += decoder.decode();
    if (carry) {
      if (carry.length > MAX_LINE_CHARS) {
        throw new Error("A document line exceeds the 1 MiB safety limit.");
      }
      yield carry.replace(/\r$/, "");
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
  }
}

function boundedBlobStream(
  blob: Blob,
  runtime: DocumentRuntime,
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
        runtime.metrics.inputBytes = Math.min(
          runtime.file.size,
          runtime.metrics.inputBytes + owned.byteLength,
        );
        runtime.metrics.maxReadChunkBytes = Math.max(
          runtime.metrics.maxReadChunkBytes,
          owned.byteLength,
        );
        readBuffer =
          value.buffer.byteLength === IO_CHUNK_BYTES
            ? new Uint8Array(value.buffer)
            : new Uint8Array(IO_CHUNK_BYTES);
        controller.enqueue(owned);
        runtime.progress("Reading document");
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => {});
      },
    },
    { highWaterMark: 1 },
  );
}

function createWriter(runtime: DocumentRuntime, phase: string) {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(IO_CHUNK_BYTES);
  let used = 0;
  const flush = async () => {
    if (!used) return;
    await runtime.write(buffer.slice(0, used), phase);
    used = 0;
  };
  return {
    async write(value: string) {
      let remaining = value;
      while (remaining) {
        const result = encoder.encodeInto(remaining, buffer.subarray(used));
        used += result.written;
        remaining = remaining.slice(result.read);
        if (used === buffer.byteLength) await flush();
        if (result.read === 0 && result.written === 0) {
          await flush();
        }
      }
    },
    flush,
  };
}
