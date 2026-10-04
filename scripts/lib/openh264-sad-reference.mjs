import { createHash } from "node:crypto";

export const SAD_SOURCE_SHA256 = "82c47be2c051aa92079ac0c731818c4a33612c6dbe61534ada5c0ac5c33667ae";
export const SAD_SOURCE_URL = "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/common/src/sad_common.cpp";
export const SAD_SHAPES = ["8x8", "16x8", "8x16", "16x16"];

export function makeSadReference(bytes) {
  if (bytes.length !== 8268 || createHash("sha256").update(bytes).digest("hex") !== SAD_SOURCE_SHA256) {
    throw new Error("Pinned OpenH264 SAD source mismatch");
  }
  const text = bytes.toString("utf8");
  const bodies = SAD_SHAPES.map((shape) => {
    const start = text.indexOf(`int32_t WelsSampleSad${shape}_c (`);
    const opening = text.indexOf("{", start);
    let depth = 1, end = opening + 1;
    for (; end < text.length && depth; ++end) {
      if (text[end] === "{") ++depth;
      if (text[end] === "}") --depth;
    }
    if (start < 0 || opening < start || depth) throw new Error("Pinned scalar SAD body not found");
    // Names only; retain every original statement and dependency call.
    return text.slice(start, end).replace(/WelsSampleSad(8x8|16x8|8x16|16x16)_c/g, "within_sad_reference_$1");
  });
  return `${text.slice(0, text.indexOf("*/") + 2)}\n#include <stdint.h>\n#define WELS_ABS(x) ((x) < 0 ? -(x) : (x))\n${bodies.join("\n")}\n`;
}
