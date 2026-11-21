// Historical evidence only. Never infer current browser qualification from it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { preDocxParagraphAlignment } from "./reviewed-docx-paragraph-alignment.mjs";
import { preTimedTextIntegration } from "./reviewed-timed-text-integration.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "workers/docx-outline.ts": ["ac11aa2eb3d122131ab8108daffc0e66cb1397acd47cb649ccb5a5e3c528b882", "fe98f539dd176da17e7e29ca6a953a1572ffca1996fbf4a207df59bd2a1f19b6"],
  "workers/docx-html-conversion.ts": ["0f00ecbe348a782ba2388543c5d67f9e4524c7707f78b880861a211cc9e48d4c", "a90176d2208e176eaa7f7e5e3f3c63c7f745610c6a5767c0da11fc036ee98264"],
  "lib/capability-registry.ts": ["8441cf882fe64a188928ac6f6672d2a1f38cbd963bc98de3d8e9fb45263a8798", "24f400a4e53cd01fb689ac3613040e74d5e2afd3d0aeb01918c2e434c918008c"],
};
export function preDocxColors(file, bytes) {
  bytes = preTimedTextIntegration(file, bytes);
  bytes = preDocxParagraphAlignment(file, bytes);
  if (!Object.hasOwn(pins, file) || sha(bytes) !== pins[file][1]) return bytes;
  const archived = execFileSync("git", ["show", `357a163e0d00b11c5598c25ad98701a555cd5095:${file}`], { windowsHide: true, maxBuffer: 1048576 });
  assert.equal(sha(archived), pins[file][0], file);
  return archived;
}
