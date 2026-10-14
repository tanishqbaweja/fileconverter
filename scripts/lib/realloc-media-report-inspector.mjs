// ALL prior four-conversion quality/recovery gates, actual new binary identity.
// Inspector-only derivative: never modify a report to pretend it used old core.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { REALLOC_DECODER_SHA256 } from "./realloc-attempt-abort-capture.mjs";
const root=path.resolve(import.meta.dirname,"../.."),original=await readFile(path.join(root,"scripts/lib/packet-largest-idle-media-recipe.mjs"),"utf8");
assert.equal(sha(original),"0212dd4e06d8b53dcb9e21445a790c4f058204adcd184507b28ebba49969766f");
const start=original.indexOf("function inspectBase("),end=original.indexOf("export function makeLargestIdleMediaCaller(");assert.ok(start>0&&end>start);
export const REALLOC_MEDIA_INSPECTOR_SOURCE = 'import assert from "node:assert/strict";\n'+
  `import { inspectBitrateDiagnostic } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/encoder-plane-bitrate-browser-recipe.mjs")).href)};\n`+
  `import { inspectRecoveryDiagnostic } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/encoder-plane-recovery-browser-recipe.mjs")).href)};\n`+
  `const decoderSha=${JSON.stringify(REALLOC_DECODER_SHA256)};\n`+original.slice(start,end);
const factory=await import("data:text/javascript;base64,"+Buffer.from(REALLOC_MEDIA_INSPECTOR_SOURCE).toString("base64"));
export const inspectReallocMediaReport = factory.inspectLargestIdleMediaReport;
