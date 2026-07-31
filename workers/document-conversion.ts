import type { ConversionMetrics } from "../lib/conversion-protocol";

const IO_CHUNK_BYTES = 256 * 1024;
const MAX_LINE_CHARS = 1024 * 1024;

interface DocumentRuntime {
  file: File;
  profileId: "txt-to-html" | "md-to-html" | "html-to-txt";
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
  } else if (runtime.profileId === "md-to-html") {
    await markdownToHtml(runtime);
  } else {
    await htmlToText(runtime);
  }
  runtime.metrics.inputBytes = runtime.file.size;
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
  let paragraph: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let codeLanguage = "";

  const closeParagraph = async () => {
    if (!paragraph.length) return;
    await writer.write(
      `<p>${renderMarkdownInline(paragraph.join(" "))}</p>\n`,
    );
    paragraph = [];
  };
  const closeList = async () => {
    if (!list) return;
    await writer.write(`</${list}>\n`);
    list = null;
  };

  for await (const line of readLines(runtime)) {
    runtime.assertActive();
    if (inCode) {
      if (/^ {0,3}```\s*$/.test(line)) {
        await writer.write("</code></pre>\n");
        inCode = false;
        codeLanguage = "";
      } else {
        await writer.write(`${escapeHtml(line)}\n`);
      }
      continue;
    }
    const fence = line.match(/^ {0,3}```\s*([A-Za-z0-9_+-]*)\s*$/);
    if (fence) {
      await closeParagraph();
      await closeList();
      inCode = true;
      codeLanguage = fence[1];
      await writer.write(
        `<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""}>`,
      );
      continue;
    }
    if (!line.trim()) {
      await closeParagraph();
      await closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      await closeParagraph();
      await closeList();
      const level = heading[1].length;
      await writer.write(
        `<h${level}>${renderMarkdownInline(heading[2])}</h${level}>\n`,
      );
      continue;
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      await closeParagraph();
      await closeList();
      await writer.write("<hr>\n");
      continue;
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      await closeParagraph();
      const nextList = unordered ? "ul" : "ol";
      if (list !== nextList) {
        await closeList();
        list = nextList;
        await writer.write(`<${list}>\n`);
      }
      await writer.write(
        `<li>${renderMarkdownInline((unordered ?? ordered)?.[1] ?? "")}</li>\n`,
      );
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      await closeParagraph();
      await closeList();
      await writer.write(
        `<blockquote><p>${renderMarkdownInline(quote[1])}</p></blockquote>\n`,
      );
      continue;
    }
    await closeList();
    paragraph.push(line.trim());
    if (paragraph.reduce((sum, part) => sum + part.length, 0) > MAX_LINE_CHARS) {
      throw new Error("A Markdown paragraph exceeds the 1 MiB safety limit.");
    }
  }
  if (inCode) throw new Error("Markdown input ends inside a fenced code block.");
  await closeParagraph();
  await closeList();
  await writer.write("</body>\n</html>\n");
  await writer.flush();
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
): AsyncGenerator<string> {
  const reader = boundedBlobStream(runtime.file, runtime).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
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
