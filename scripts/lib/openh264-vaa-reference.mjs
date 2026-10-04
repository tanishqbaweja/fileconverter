import { createHash } from "node:crypto";

export const VAA_SOURCE_SHA256 = "69a57a09170a613b472a28f339bf54e72a82c2d46bc0c69e62d0abb676353b3a";
export const VAA_SOURCE_URL = "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/processing/src/vaacalc/vaacalcfuncs.cpp";

export function makeVaaReference(bytes) {
  if (bytes.length !== 19566 || createHash("sha256").update(bytes).digest("hex") !== VAA_SOURCE_SHA256) {
    throw new Error("Pinned OpenH264 VAA source mismatch");
  }
  const text = bytes.toString("utf8");
  const start = text.indexOf("void VAACalcSadBgd_c (");
  const opening = text.indexOf("{", start);
  let depth = 1, end = opening + 1;
  for (; end < text.length && depth; ++end) {
    if (text[end] === "{") ++depth;
    if (text[end] === "}") --depth;
  }
  if (start < 0 || opening < start || depth !== 0) throw new Error("Pinned scalar function not found");
  const license = text.slice(0, text.indexOf("*/") + 2);
  const original = text.slice(start, end);
  // The only substitution inside the exact pinned body is its function name.
  // WELS_ABS is exact for the byte differences [-255,255] used by this function.
  return `${license}\n#include <stdint.h>\n#define WELS_ABS(x) ((x) < 0 ? -(x) : (x))\n${original.replace("VAACalcSadBgd_c", "within_vaa_reference")}\n`;
}
