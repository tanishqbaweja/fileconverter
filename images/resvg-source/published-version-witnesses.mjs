// Read-only binary/source provenance. Never instantiate a renderer or selected file.
import assert from "node:assert/strict";
import { pins, sha } from "./source-pins.mjs";
const publishedSha = "22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70";
export function wasmSections(bytes) {
  assert.ok(bytes.length >= 8 && bytes.length <= 16 * 1024 * 1024);
  assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0]);
  let cursor = 8; const sections = [];
  while (cursor < bytes.length) {
    const id = bytes[cursor++]; assert.ok(id <= 12);
    let length = 0, shift = 0, done = false;
    for (let index = 0; index < 5; index++) {
      assert.ok(cursor < bytes.length); const value = bytes[cursor++];
      length += (value & 127) * 2 ** shift; shift += 7;
      if (!(value & 128)) { done = true; break; }
    }
    assert.ok(done && Number.isSafeInteger(length) && cursor + length <= bytes.length);
    sections.push({ id, start: cursor, end: cursor + length }); cursor += length;
    assert.ok(sections.length <= 128);
  }
  return sections;
}
export function recoverPublishedVersionWitnesses(bytes, lock) {
  assert.equal(sha(bytes), publishedSha, "Only the exact published engine, never an assumed source build");
  assert.ok(Buffer.byteLength(lock) <= 262144);
  const sections = wasmSections(bytes), text = bytes.toString("latin1"), grouped = new Map();
  const candidate = new Map();
  for (const entry of lock.split("[[package]]").slice(1)) {
    const name = entry.match(/^name = "([^"\n]+)"$/m)?.[1], version = entry.match(/^version = "([^"\n]+)"$/m)?.[1];
    assert.ok(name && version); const versions = candidate.get(name) ?? []; versions.push(version); candidate.set(name, versions);
  }
  const pattern = /\/home\/runner\/\.cargo\/registry\/src\/[^/\s\x00-\x20]{1,100}\/([a-z][a-z0-9_-]{0,80})-(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.]+)?)\/(?:src|build)[/][a-zA-Z0-9_./-]{1,160}\.rs/g;
  let matches = 0;
  for (const match of text.matchAll(pattern)) {
    const section = sections.find(row => match.index >= row.start && match.index + match[0].length <= row.end);
    assert.ok(section && section.id === 11, "Version witness must be a string entirely within the actual Wasm data section");
    const name = match[1], version = match[2], key = name + "@" + version;
    let row = grouped.get(key);
    if (!row) {
      row = { name, version, firstOffset: match.index, sectionId: section.id, examplePath: match[0], occurrences: 0,
        candidateVersions: candidate.get(name) ?? [], exactVersionPresentInCandidate: (candidate.get(name) ?? []).includes(version) };
      grouped.set(key, row);
    }
    row.occurrences++; matches++; assert.ok(matches <= 1000 && grouped.size <= 128);
  }
  assert.ok(grouped.size > 0);
  return { publishedWasm: { bytes: bytes.length, sha256: publishedSha },
    candidateLockSha256: sha(lock), upstreamCommit: pins.upstream,
    witnesses: [...grouped.values()].sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version)),
    summary: { uniqueVersionWitnesses: grouped.size, pathOccurrences: matches,
      exactVersionsPresentInCandidate: [...grouped.values()].filter(row => row.exactVersionPresentInCandidate).length,
      absentOrDifferentCandidateVersions: [...grouped.values()].filter(row => !row.exactVersionPresentInCandidate).length },
    scope: "Embedded Rust registry source-path strings in actual published Wasm data; version witnesses, not a complete Cargo graph or certification of linked source",
    completeHistoricalDependencyGraphRecovered: false, candidateChanged: false, compilerRerun: false,
    publicEngineChanged: false, browserOrMemoryAcceptance: false, originalGoalComplete: false };
}
