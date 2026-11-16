import type { ZipEntry } from "./archive-conversion";
import type { DocxRuntime } from "./docx-conversion";
import { metadataElements, type Element } from "./docx-outline";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const NUMBERING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
export const DOCX_NUMBERING_LIMITS = Object.freeze({ definitions: 1024, instances: 1024, levels: 9,
  labelCharacters: 256, maximumCounter: 2147483647 });
type Level = { start?: number; format?: string; text?: string; suffix?: string; restart?: number;
  legal?: boolean; style?: string; unsupported?: string };
type Abstract = { levels: Map<number, Level>; unsupported?: string };
type Override = { start?: number; level?: Level };
type Instance = { abstractId?: number; overrides: Map<number, Override> };
export type DocxNumberingReference = { numId?: number; level?: number };
export type DocxListMarker = { numId: number; level: number; value: number; text: string; suffix: string; ordered: boolean };
export type DocxNumberingModel = { definitionCount: number; instanceCount: number;
  next(reference: DocxNumberingReference, styleIds?: readonly string[]): DocxListMarker | undefined };
const attr = (e: Element, local: string, uri = WORD) => e.attributes.get(uri + "\0" + local);
const word = (e: Element | undefined, local: string) => e?.uri === WORD && e.local === local;
export function parseDocxNumberingInteger(value: string | undefined, maximum: number = DOCX_NUMBERING_LIMITS.maximumCounter): number {
  if (value === undefined || !/^\+?\d{1,10}$/.test(value) || Number(value) > maximum)
    throw new Error("DOCX numbering requires a bounded non-negative integer.");
  return Number(value);
}
function once<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  if (target[key] !== undefined) throw new Error("DOCX numbering repeats a supported property.");
  target[key] = value;
}
function onOff(value?: string) {
  if (value !== undefined && !["true", "false", "on", "off", "0", "1"].includes(value)) throw new Error("DOCX numbering has an invalid on/off value.");
  return value === undefined || ["true", "on", "1"].includes(value);
}

/** Optional, internal, streamed metadata only. Definitions and counters are
 * bounded independently of paragraph/file size, and never cached across jobs.
 * Unsupported numbering is rejected when referenced, not silently fabricated.
 */
export async function readDocxNumberingModel(runtime: DocxRuntime, entries: ReadonlyMap<string, ZipEntry>): Promise<DocxNumberingModel> {
  const relationship = entries.get("word/_rels/document.xml.rels"); let part: string | undefined;
  if (relationship) for await (const e of metadataElements(runtime, relationship, RELS, "Relationships")) {
    if (e.uri !== RELS || e.local !== "Relationship" || e.depth !== 2 || attr(e, "Type", "") !== NUMBERING_REL) continue;
    if (part !== undefined) throw new Error("DOCX contains multiple numbering relationships.");
    const target = attr(e, "Target", "");
    if (attr(e, "TargetMode", "") === "External" || !target || target.length > 2048 || /[\\\u0000]/.test(target) ||
      /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) throw new Error("DOCX numbering requires an internal package part.");
    const resolved = new URL(target, "https://within.invalid/word/document.xml");
    if (resolved.origin !== "https://within.invalid" || resolved.search || resolved.hash) throw new Error("DOCX numbering part URI is unsafe.");
    try { part = decodeURIComponent(resolved.pathname).slice(1); } catch { throw new Error("DOCX numbering part URI encoding is invalid."); }
    if (!part || /[\\\u0000]/.test(part) || part.split("/").some(p => !p || p === "." || p === "..")) throw new Error("DOCX numbering part path is unsafe.");
  }
  const abstracts = new Map<number, Abstract>(), instances = new Map<number, Instance>();
  if (part !== undefined) {
    const entry = entries.get(part); if (!entry || entry.directory) throw new Error("DOCX referenced numbering part is missing.");
    let abstract: { element: Element; value: Abstract } | undefined;
    let instance: { element: Element; value: Instance } | undefined;
    let override: { element: Element; value: Override; index: number } | undefined;
    let level: { element: Element; value: Level } | undefined;
    for await (const e of metadataElements(runtime, entry, WORD, "numbering")) {
      runtime.assertActive();
      if (word(e, "abstractNum") && e.depth === 2) {
        const id = parseDocxNumberingInteger(attr(e, "abstractNumId"));
        if (abstracts.size >= DOCX_NUMBERING_LIMITS.definitions || abstracts.has(id)) throw new Error("DOCX numbering definition limit or duplicate identifier.");
        const value: Abstract = { levels: new Map() }; abstracts.set(id, value); abstract = { element: e, value };
      } else if (word(e, "num") && e.depth === 2) {
        const id = parseDocxNumberingInteger(attr(e, "numId"));
        if (id === 0 || instances.size >= DOCX_NUMBERING_LIMITS.instances || instances.has(id)) throw new Error("DOCX numbering instance limit or duplicate/reserved identifier.");
        const value: Instance = { overrides: new Map() }; instances.set(id, value); instance = { element: e, value };
      } else if (word(e, "abstractNumId") && instance && e.parent === instance.element) {
        once(instance.value, "abstractId", parseDocxNumberingInteger(attr(e, "val")));
      } else if (word(e, "lvlOverride") && instance && e.parent === instance.element) {
        const index = parseDocxNumberingInteger(attr(e, "ilvl"), 8);
        if (instance.value.overrides.has(index)) throw new Error("DOCX numbering repeats a level override.");
        const value: Override = {}; instance.value.overrides.set(index, value); override = { element: e, value, index };
      } else if (word(e, "startOverride") && override && e.parent === override.element) {
        once(override.value, "start", parseDocxNumberingInteger(attr(e, "val")));
      } else if (word(e, "lvl")) {
        const index = parseDocxNumberingInteger(attr(e, "ilvl"), 8), value: Level = {};
        if (abstract && e.parent === abstract.element) {
          if (abstract.value.levels.has(index)) throw new Error("DOCX numbering repeats an abstract level.");
          abstract.value.levels.set(index, value);
        } else if (override && e.parent === override.element) {
          if (index !== override.index) throw new Error("DOCX numbering override level index mismatch.");
          once(override.value, "level", value);
        } else continue;
        level = { element: e, value };
      } else if (abstract && e.parent === abstract.element && e.uri === WORD && ["numStyleLink", "styleLink"].includes(e.local)) {
        abstract.value.unsupported = "linked numbering styles";
      } else if (level && e.parent === level.element && e.uri === WORD) {
        const val = attr(e, "val"), target = level.value;
        switch (e.local) {
          case "start": once(target, "start", parseDocxNumberingInteger(val)); break;
          case "numFmt":
            if (!val || val.length > 64) throw new Error("DOCX numbering format is invalid.");
            once(target, "format", val); if (attr(e, "format") !== undefined) target.unsupported = "custom numbering format"; break;
          case "lvlText":
            if (val === undefined || val.length > DOCX_NUMBERING_LIMITS.labelCharacters) throw new Error("DOCX numbering label exceeds256characters or is missing.");
            once(target, "text", onOff(attr(e, "null") ?? "false") ? "" : val); break;
          case "suff":
            if (!["tab", "space", "nothing"].includes(val ?? "")) throw new Error("DOCX numbering suffix is invalid.");
            once(target, "suffix", val); break;
          case "lvlRestart": once(target, "restart", parseDocxNumberingInteger(val, 9)); break;
          case "isLgl": once(target, "legal", onOff(val)); break;
          case "pStyle":
            if (!val || val.length > 256) throw new Error("DOCX numbering paragraph style is invalid.");
            once(target, "style", val); break;
          case "lvlPicBulletId": case "legacy": target.unsupported = "picture or legacy list markers"; break;
        }
      }
    }
  }
  const counters = new Map<number, (number | undefined)[]>();
  const definition = (instance: Instance, abstract: Abstract, index: number): Level => {
    const value = instance.overrides.get(index)?.level ?? abstract.levels.get(index);
    if (!value) throw new Error("DOCX references a missing numbering level.");
    if (abstract.unsupported || value.unsupported) throw new Error("DOCX numbering cannot preserve " + (abstract.unsupported ?? value.unsupported) + ".");
    return value;
  };
  return { definitionCount: abstracts.size, instanceCount: instances.size,
    next(reference, styleIds = []) {
      runtime.assertActive();
      if (reference.numId === undefined || reference.numId === 0) return undefined;
      const numId = parseDocxNumberingInteger(String(reference.numId)), instance = instances.get(numId);
      const abstract = instance?.abstractId !== undefined ? abstracts.get(instance.abstractId) : undefined;
      if (!instance || !abstract) throw new Error("DOCX references an unavailable numbering instance or abstract definition.");
      if (styleIds.length > 64) throw new Error("DOCX numbering style chain exceeds64levels.");
      const associated = styleIds.map(id => [...abstract.levels].filter(([, level]) => level.style === id).map(([index]) => index)).find(indices => indices.length);
      if (associated && associated.length !== 1) throw new Error("DOCX paragraph style maps to ambiguous numbering levels.");
      const index = reference.level ?? associated?.[0] ?? 0; parseDocxNumberingInteger(String(index), 8);
      const level = definition(instance, abstract, index), format = level.format ?? "decimal";
      const values = counters.get(numId) ?? new Array<number | undefined>(9); counters.set(numId, values);
      const starting = (n: number) => instance.overrides.get(n)?.start ?? definition(instance, abstract, n).start ?? 0;
      const value = values[index] === undefined ? starting(index) : values[index]! + 1;
      if (value > DOCX_NUMBERING_LIMITS.maximumCounter) throw new Error("DOCX numbering counter exceeds the bounded integer range.");
      const text = (level.text ?? "").replace(/%([1-9])/g, (_, digit) => {
        const n = Number(digit) - 1; if (n > index) return "";
        const refLevel = definition(instance, abstract, n);
        return formatDocxListNumber(n === index ? value : values[n] ?? starting(n), level.legal ? "decimal" : refLevel.format ?? "decimal");
      });
      // Check even literal-only levels before accepting their representation.
      formatDocxListNumber(value, format);
      values[index] = value;
      for (let n = index + 1; n < 9; n++) {
        const child = instance.overrides.get(n)?.level ?? abstract.levels.get(n); if (!child) continue;
        const restart = child.restart === undefined || child.restart > n ? n : child.restart;
        if (restart !== 0 && restart - 1 === index) values[n] = undefined;
      }
      if (text.length > 8192) throw new Error("DOCX expanded numbering label exceeds its bounded limit.");
      return { numId, level: index, value, text, suffix: level.suffix === "nothing" ? "" : level.suffix === "space" ? " " : "\t",
        ordered: format !== "bullet" && format !== "none" };
    } };
}

export function formatDocxListNumber(value: number, format: string): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > DOCX_NUMBERING_LIMITS.maximumCounter) throw new Error("DOCX numbering counter is invalid.");
  if (format === "none" || format === "bullet") return "";
  if (format === "decimal" || format === "decimalZero") return format === "decimalZero" ? String(value).padStart(2, "0") : String(value);
  if (format === "upperLetter" || format === "lowerLetter") {
    if (!value) throw new Error("DOCX alphabetic numbering cannot represent zero.");
    // Word's alphabetic sequence is A..Z, AA, BB..ZZ, AAA (not Excel columns).
    const repeats = Math.ceil(value / 26);
    if (repeats > DOCX_NUMBERING_LIMITS.labelCharacters) throw new Error("DOCX alphabetic numbering exceeds256characters.");
    const result = String.fromCharCode(65 + (value - 1) % 26).repeat(repeats);
    return format === "lowerLetter" ? result.toLowerCase() : result;
  }
  if (format === "upperRoman" || format === "lowerRoman") {
    if (!value || value > 3999) throw new Error("DOCX Roman numbering supports values1through3999.");
    let result = "", n = value;
    for (const [number, token] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const)
      while (n >= number) { result += token; n -= number; }
    return format === "lowerRoman" ? result.toLowerCase() : result;
  }
  throw new Error("DOCX numbering format is not supported: " + format.slice(0,64));
}
