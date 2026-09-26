export const MAX_STRUCTURED_INSPECTION_BYTES = 256 * 1024;

export interface StructuredSourceFact {
  label: string;
  value: string;
}

export interface StructuredSourceInspection {
  kind: "data" | "document" | "subtitle";
  structure: string;
  facts: readonly StructuredSourceFact[];
  notes: readonly string[];
  inspectedBytes: number;
  maximumInspectionBytes: number;
  completeFile: boolean;
}

const supportedFormats = new Set([
  "ass",
  "csv",
  "html",
  "json",
  "md",
  "ndjson",
  "srt",
  "tsv",
  "ttml",
  "txt",
  "vtt",
  "xml",
]);

function formatKind(format: string): StructuredSourceInspection["kind"] {
  if (["ass", "srt", "ttml", "vtt"].includes(format)) return "subtitle";
  if (["csv", "json", "ndjson", "tsv", "xml"].includes(format)) return "data";
  return "document";
}

function lineCount(text: string, completeFile: boolean): number {
  if (text.length === 0) return 0;
  const newlines = (text.match(/\n/g) ?? []).length;
  return newlines + (completeFile && !text.endsWith("\n") ? 1 : 0);
}

function countLabel(noun: string, count: number, completeFile: boolean): StructuredSourceFact {
  return {
    label: noun,
    value: completeFile ? count.toLocaleString("en-US") : `At least ${count.toLocaleString("en-US")} in inspected prefix`,
  };
}

function firstDelimitedRecord(text: string, delimiter: string): string[] | null {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      fields.push(field);
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      fields.push(field);
      return fields;
    } else {
      field += character;
    }
  }
  if (quoted) return null;
  fields.push(field);
  return fields;
}

function delimitedRecordCount(text: string, completeFile: boolean): number {
  let quoted = false;
  let records = 0;
  let recordHasContent = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
      recordHasContent = true;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (recordHasContent) records += 1;
      recordHasContent = false;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      recordHasContent ||= character.trim().length > 0;
    }
  }
  if (completeFile && !quoted && recordHasContent) records += 1;
  return records;
}

function rootElement(text: string): string | null {
  const withoutPreamble = text
    .replace(/^\uFEFF?\s*<\?xml[^>]*\?>/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>/i, "");
  return withoutPreamble.match(/<\s*([A-Za-z_][\w:.-]*)\b/)?.[1] ?? null;
}

function topLevelJson(text: string, completeFile: boolean): StructuredSourceFact[] {
  const trimmed = text.trimStart();
  const facts: StructuredSourceFact[] = [
    {
      label: "Top-level JSON",
      value: trimmed.startsWith("[")
        ? "Array"
        : trimmed.startsWith("{")
          ? "Object"
          : "Scalar or unavailable",
    },
  ];
  if (!completeFile) return facts;
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    facts.push({ label: "Array items", value: parsed.length.toLocaleString("en-US") });
  } else if (parsed && typeof parsed === "object") {
    facts.push({
      label: "Top-level fields",
      value: Object.keys(parsed as Record<string, unknown>).length.toLocaleString("en-US"),
    });
  }
  return facts;
}

function inspectText(
  text: string,
  format: string,
  completeFile: boolean,
): Pick<StructuredSourceInspection, "structure" | "facts" | "notes"> {
  const notes: string[] = [];
  const lines = lineCount(text, completeFile);
  if (format === "csv" || format === "tsv") {
    const delimiter = format === "csv" ? "," : "\t";
    const header = firstDelimitedRecord(text, delimiter);
    const records = delimitedRecordCount(text, completeFile);
    return {
      structure: format === "csv" ? "Delimited CSV records" : "Delimited TSV records",
      facts: [
        countLabel("Records", records, completeFile),
        { label: "Header columns", value: header ? header.length.toLocaleString("en-US") : "Unavailable within bounded prefix" },
        { label: "Delimiter", value: format === "csv" ? "Comma" : "Tab" },
      ],
      notes,
    };
  }
  if (format === "json") {
    return {
      structure: "JSON value",
      facts: topLevelJson(text, completeFile),
      notes: completeFile ? notes : ["Full JSON validity is checked by the conversion worker because this bounded prefix does not contain the complete value."],
    };
  }
  if (format === "ndjson") {
    const records = text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return {
      structure: "Newline-delimited JSON records",
      facts: [countLabel("Non-empty records", records, completeFile)],
      notes,
    };
  }
  if (format === "xml" || format === "ttml" || format === "html") {
    const root = rootElement(text);
    const doctype = /<!DOCTYPE\b/i.test(text);
    const facts: StructuredSourceFact[] = [
      { label: "Root element", value: root ?? "Unavailable within bounded prefix" },
      { label: "DOCTYPE declaration", value: doctype ? "Present; worker safety validation required" : "Not found in inspected prefix" },
    ];
    if (format === "ttml") {
      const cues = (text.match(/<(?:\w+:)?p\b/gi) ?? []).length;
      facts.push(countLabel("Timed paragraph cues", cues, completeFile));
    }
    return {
      structure: format === "html" ? "HTML document" : format === "ttml" ? "TTML document" : "XML document",
      facts,
      notes: completeFile ? notes : ["The conversion worker performs complete streaming XML/HTML safety and well-formedness validation."],
    };
  }
  if (format === "srt" || format === "vtt") {
    const cues = (text.match(/^\s*(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}\s+-->\s+(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}/gm) ?? []).length;
    const signature = format === "vtt" ? /^\uFEFF?WEBVTT(?:[ \t]|$)/.test(text) : true;
    return {
      structure: format === "vtt" ? "WebVTT cues" : "SubRip cues",
      facts: [
        countLabel("Cue timings", cues, completeFile),
        ...(format === "vtt" ? [{ label: "WEBVTT signature", value: signature ? "Present" : "Missing" }] : []),
      ],
      notes,
    };
  }
  if (format === "ass") {
    const dialogues = (text.match(/^Dialogue\s*:/gim) ?? []).length;
    const sections = (text.match(/^\s*\[[^\]\r\n]+\]\s*$/gm) ?? []).length;
    return {
      structure: "ASS/SSA subtitle script",
      facts: [countLabel("Dialogue events", dialogues, completeFile), countLabel("Sections", sections, completeFile)],
      notes,
    };
  }
  if (format === "md") {
    const headings = (text.match(/^#{1,6}\s+/gm) ?? []).length;
    return {
      structure: "Markdown text",
      facts: [countLabel("Text lines", lines, completeFile), countLabel("ATX headings", headings, completeFile)],
      notes,
    };
  }
  return {
    structure: "UTF-8 plain text",
    facts: [countLabel("Text lines", lines, completeFile)],
    notes,
  };
}

export async function inspectStructuredSource(
  file: File,
  format: string,
): Promise<StructuredSourceInspection | null> {
  if (!supportedFormats.has(format)) return null;
  const inspectedBytes = Math.min(file.size, MAX_STRUCTURED_INSPECTION_BYTES);
  const bytes = new Uint8Array(await file.slice(0, inspectedBytes).arrayBuffer());
  const completeFile = inspectedBytes === file.size;
  let text: string;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(bytes, { stream: !completeFile });
  } catch {
    throw new Error("The bounded source prefix is not valid UTF-8 text.");
  }
  const details = inspectText(text.replace(/^\uFEFF/, ""), format, completeFile);
  return {
    kind: formatKind(format),
    ...details,
    notes: [
      ...details.notes,
      completeFile
        ? "The complete source fit inside the fixed inspection ceiling."
        : "Only the fixed-size source prefix was inspected; counts are lower bounds and complete validation remains in the conversion worker.",
    ],
    inspectedBytes,
    maximumInspectionBytes: MAX_STRUCTURED_INSPECTION_BYTES,
    completeFile,
  };
}
