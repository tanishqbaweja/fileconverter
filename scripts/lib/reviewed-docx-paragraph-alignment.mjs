// Exact archived comparison only; not production/browser qualification.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { preDocxRunVertical } from "./reviewed-docx-run-vertical.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "workers/docx-outline.ts": ["fe98f539dd176da17e7e29ca6a953a1572ffca1996fbf4a207df59bd2a1f19b6", "b8a1c0b9da392a9a9fe157d0c164ebf521ea8291fef5aadbd11c65493bc19f94"],
  "workers/docx-html-conversion.ts": ["a90176d2208e176eaa7f7e5e3f3c63c7f745610c6a5767c0da11fc036ee98264", "c69513e33acdaa645c0cccf7ec014065d42eb172387429fdbc75412e13337843"],
};

export function preDocxHtmlEncoding(file, bytes) {
  bytes = preDocxRunVertical(file, bytes);
  if (file !== "workers/docx-html-conversion.ts" ||
      sha(bytes) !== "30e7763523d3efafc0a6d5034fbc00d080b2bfe6e17a2be7c051e29dafdbca34") return bytes;
  const archived = execFileSync("git", ["show", `eac518f1ad88dc51214971ebfdc50441bc0c7b3b:${file}`],
    { windowsHide: true, maxBuffer: 1_048_576 });
  assert.equal(sha(archived), pins[file][1], file);
  return archived;
}

export function preDocxParagraphAlignment(file, bytes) {
  bytes = preDocxHtmlEncoding(file, bytes);
  if (!Object.hasOwn(pins, file) || sha(bytes) !== pins[file][1]) return bytes;
  const archived = execFileSync("git", ["show", `80ebad431f150634c2d5e2101d160dfc0263107d:${file}`],
    { windowsHide: true, maxBuffer: 1_048_576 });
  assert.equal(sha(archived), pins[file][0], file);
  return archived;
}
