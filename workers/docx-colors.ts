import type { ZipEntry } from "./archive-conversion";
import type { DocxRuntime } from "./docx-conversion";
import type { metadataElements } from "./docx-outline";

const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const slots = {
  dark1: "dk1", dark2: "dk2", light1: "lt1", light2: "lt2", accent1: "accent1", accent2: "accent2",
  accent3: "accent3", accent4: "accent4", accent5: "accent5", accent6: "accent6", hyperlink: "hlink", followedHyperlink: "folHlink",
} as const;
const mapped = {
  text1: "t1", text2: "t2", background1: "bg1", background2: "bg2", accent1: "accent1", accent2: "accent2",
  accent3: "accent3", accent4: "accent4", accent5: "accent5", accent6: "accent6", hyperlink: "hyperlink", followedHyperlink: "followedHyperlink",
} as const;
const defaults = { text1: "dark1", text2: "dark2", background1: "light1", background2: "light2" } as const;
type Slot = typeof slots[keyof typeof slots];
type Theme = keyof typeof slots | keyof typeof defaults;
type CssColor = `#${string}` | "CanvasText";
export type DocxColor = { rgb?: string; theme?: Theme; tint?: number; shade?: number; unknownTheme?: boolean };
const has = <T extends object>(object: T, key: PropertyKey): key is keyof T => Object.hasOwn(object, key);
const rgb = (s?: string) => s && /^[\da-f]{6}$/i.test(s) ? s.toLowerCase() : undefined;

export function parseDocxColor(get: (name: string) => string | undefined): DocxColor {
  const val = get("val"), theme = get("themeColor");
  const fallback = val === "auto" ? val : rgb(val);
  if ((!fallback && val !== undefined) || (val === undefined && theme === undefined))
    throw new Error("DOCX run color must specify a six-digit RGB value, automatic color, or a theme reference.");
  const modifier = (name: string) => {
    const value = get(name);
    if (value === undefined) return undefined;
    if (!/^[\da-f]{2}$/i.test(value)) throw new Error("DOCX run theme tint/shade must be one hexadecimal byte.");
    return parseInt(value, 16);
  };
  return { rgb: fallback, theme: theme && (has(slots, theme) || has(defaults, theme)) ? theme : undefined,
    tint: modifier("themeTint"), shade: modifier("themeShade"), unknownTheme: theme !== undefined && theme !== "none" && !has(slots, theme) && !has(defaults, theme) };
}

// Preserve hue/saturation by rescaling each channel's offset from HSL lightness.
// Word uses tint in preference to shade when both are present (MS-OI29500 2.1.72).
// Round once at RGB serialization; legacy Word intermediate rounding may differ.
function adjust(base: string, tint?: number, shade?: number): string {
  if (tint === undefined && shade === undefined) return base;
  const channels = [0, 2, 4].map(i => parseInt(base.slice(i, i + 2), 16) / 255);
  const l = (Math.max(...channels) + Math.min(...channels)) / 2;
  const next = tint !== undefined ? 1 - (1 - l) * (tint / 255) : l * (shade! / 255);
  const range = Math.min(l, 1 - l);
  const scale = range === 0 ? 0 : Math.min(next, 1 - next) / range;
  return channels.map(c => Math.round(Math.max(0, Math.min(1, next + (c - l) * scale)) * 255).toString(16).padStart(2, "0")).join("");
}

/** Fixed 12-slot palette; only package-relative, individually bounded XML parts are opened. */
export async function readDocxColors(runtime: DocxRuntime, entries: ReadonlyMap<string, ZipEntry>,
  themePath: string | undefined, settingsPath: string | undefined, metadata: typeof metadataElements) {
  const palette = new Map<Slot, string | undefined>(), mapping = new Map<Theme, Slot | undefined>();
  if (themePath !== undefined) {
    const entry = entries.get(themePath);
    if (!entry || entry.directory) throw new Error("DOCX referenced theme part is missing.");
    let schemeSeen = false;
    let current: { depth: number; slot: Slot; color?: string; hasColor: boolean; unsupported: boolean } | undefined;
    const finish = () => {
      if (current) palette.set(current.slot, current.unsupported ? undefined : current.color);
      current = undefined;
    };
    for await (const el of metadata(runtime, entry, DRAWING, "theme")) {
      if (current && el.depth <= current.depth) finish();
      if (el.uri === DRAWING && el.local === "clrScheme" && el.depth === 3 &&
          el.parent?.uri === DRAWING && el.parent.local === "themeElements") {
        if (schemeSeen) throw new Error("DOCX theme contains multiple color schemes.");
        schemeSeen = true;
      }
      if (el.uri === DRAWING && el.depth === 4 && el.parent?.local === "clrScheme" &&
          el.parent.uri === DRAWING && el.parent.parent?.local === "themeElements" && el.parent.parent.uri === DRAWING &&
          Object.values(slots).includes(el.local as Slot)) {
        const slot = el.local as Slot;
        if (palette.has(slot)) throw new Error("DOCX theme repeats a color slot.");
        current = { depth: 4, slot, hasColor: false, unsupported: false };
      } else if (current) {
        if (el.depth !== 5 || el.uri !== DRAWING || current.hasColor) { current.unsupported = true; continue; }
        current.hasColor = true;
        // System-dependent colors use the package's saved RGB, not host preferences.
        current.color = rgb(el.attributes.get(el.local === "srgbClr" ? "\0val" : el.local === "sysClr" ? "\0lastClr" : ""));
      }
    }
    finish();
  }
  if (themePath !== undefined && settingsPath !== undefined) {
    const entry = entries.get(settingsPath);
    if (!entry || entry.directory) throw new Error("DOCX referenced settings part is missing.");
    let found = false;
    for await (const el of metadata(runtime, entry, WORD, "settings")) {
      if (el.uri !== WORD || el.local !== "clrSchemeMapping" || el.depth !== 2) continue;
      if (found) throw new Error("DOCX settings repeat the theme color mapping.");
      found = true;
      for (const theme of Object.keys(mapped) as (keyof typeof mapped)[]) {
        const name = el.attributes.get(WORD + "\0" + mapped[theme]);
        if (name !== undefined) mapping.set(theme, has(slots, name) ? slots[name] : undefined);
      }
    }
  }
  let warned = false;
  return (color?: DocxColor): CssColor | undefined => {
    if (!color) return undefined;
    if (color.theme !== undefined) {
      const theme = color.theme, slot = mapping.has(theme) ? mapping.get(theme) : slots[has(defaults, theme) ? defaults[theme] : theme];
      const base = slot && palette.get(slot);
      if (base) return `#${adjust(base, color.tint, color.shade)}`;
    }
    if ((color.theme !== undefined || color.unknownTheme) && !warned) {
      runtime.warn("A DOCX text theme color could not be resolved; using the saved RGB value or the browser text color. No external parts were loaded.");
      warned = true;
    }
    return color.rgb && color.rgb !== "auto" ? `#${color.rgb}` : "CanvasText";
  };
}
