import type { ZipEntry } from "./archive-conversion";
import type { DocxRuntime } from "./docx-conversion";
import { metadataElements } from "./docx-outline";

const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const HYPERLINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
const MAX_RELATIONSHIPS = 4096, MAX_LINKS = 1024, MAX_TARGET_CHARS = 2048;
const controls = /[\u0000-\u0020\u007f-\u009f]/;
export type DocxLink = { href: string | null };
export type DocxHyperlinkModel = { resolve(id: string): DocxLink };

export function docxHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Safe navigation only; never fetches, resolves a package part, or runs a URL. */
export function safeDocxHyperlinkTarget(value: string | undefined): string | null {
  if (!value || value.length > MAX_TARGET_CHARS || controls.test(value) || /\\|%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(value)) return null;
  if (!/^(?:https?:\/\/|mailto:)/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password ||
      (url.protocol === "mailto:" ? !url.pathname : !url.hostname)) return null;
    return value;
  } catch { return null; }
}

// The HTML id and fragment use the same bounded, collision-free ASCII encoding.
// No document-global content index, URI decoding ambiguity, CSS or source id.
export function docxBookmarkId(name: string): string {
  if (!name || name.length > 255 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) throw new Error("DOCX bookmark name is invalid or exceeds255characters.");
  return "docx-bookmark-" + Array.from(new TextEncoder().encode(name), b => b.toString(16).padStart(2, "0")).join("");
}

export async function readDocxHyperlinkModel(runtime: DocxRuntime, entries: ReadonlyMap<string, ZipEntry>): Promise<DocxHyperlinkModel> {
  const entry = entries.get("word/_rels/document.xml.rels"), links = new Map<string, DocxLink>(), ids = new Set<string>();
  if (entry) for await (const e of metadataElements(runtime, entry, RELS, "Relationships")) {
    if (e.uri !== RELS || e.local !== "Relationship" || e.depth !== 2) continue;
    if (ids.size >= MAX_RELATIONSHIPS) throw new Error("DOCX exceeds4096document relationships.");
    const id = e.attributes.get("\0Id");
    if (!id || id.length > 256 || ids.has(id)) throw new Error("DOCX document relationship identifier is missing, repeated or oversized.");
    ids.add(id);
    if (e.attributes.get("\0Type") !== HYPERLINK) continue;
    if (links.size >= MAX_LINKS) throw new Error("DOCX exceeds1024hyperlink relationships.");
    links.set(id, { href: e.attributes.get("\0TargetMode") === "External" ? safeDocxHyperlinkTarget(e.attributes.get("\0Target")) : null });
  }
  return { resolve(id) {
    if (!id || id.length > 256 || !links.has(id)) throw new Error("DOCX hyperlink references a missing, wrong-type or invalid relationship.");
    return links.get(id)!;
  } };
}
