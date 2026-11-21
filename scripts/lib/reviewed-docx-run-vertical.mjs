// Exact archived comparison only; no current browser acceptance is inherited.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "workers/docx-html-conversion.ts": ["30e7763523d3efafc0a6d5034fbc00d080b2bfe6e17a2be7c051e29dafdbca34", "3f0155e9ef0daa6d00bc370e1728cb091530eb8c7e3ccd0a3c865341721986f9"],
  "workers/docx-outline.ts": ["b8a1c0b9da392a9a9fe157d0c164ebf521ea8291fef5aadbd11c65493bc19f94", "d716032e925e1591e54c7a56f06fbcd7d6c5566df42c4cc7cef964ec2794f937"],
  "lib/capability-registry.ts": ["bf2b92240bca3f400181e8871ac48bfd37dfeb5b0c3d366b65affe972d42468a", "a8eace3d767eac85bd090e134753ea48b49b8ee5406c5a965ebffb837f31845b"],
};
export function preDocxRunVertical(file, bytes) {
  if (!Object.hasOwn(pins, file) || sha(bytes) !== pins[file][1]) return bytes;
  const archived = execFileSync("git", ["show", `929e822bf33dafd3add4b273dbc9af987cd1499d:${file}`], { windowsHide: true, maxBuffer: 1048576 });
  assert.equal(sha(archived), pins[file][0], file);
  return archived;
}
