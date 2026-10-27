import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { wasmSections, recoverPublishedVersionWitnesses } from "../images/resvg-source/published-version-witnesses.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const proof = JSON.parse(await read("evidence/2026-10-27T14-00-45-143Z-resvg-version-witnesses.json"));
test("published SVG witnesses are actual byte-offset source paths within Wasm data, not guesses from a package name", async () => {
  const bytes = await read("public/engines/svg/resvg.wasm"), lock = (await read("images/resvg-source/Cargo.candidate.lock")).toString();
  const actual = recoverPublishedVersionWitnesses(bytes, lock);
  assert.deepEqual(actual.witnesses, proof.witnesses); assert.deepEqual(actual.summary, proof.summary);
  assert.equal(proof.publishedWasm.sha256, sha(bytes)); assert.equal(proof.candidateLockSha256, sha(lock));
  const sections = wasmSections(bytes);
  for (const row of proof.witnesses) {
    assert.equal(row.sectionId, 11); assert.ok(row.occurrences > 0);
    assert.equal(bytes.subarray(row.firstOffset, row.firstOffset + row.examplePath.length).toString("latin1"), row.examplePath);
    assert.ok(sections.some(section => section.id === 11 && row.firstOffset >= section.start && row.firstOffset + row.examplePath.length <= section.end));
  }
  assert.deepEqual(proof.summary, { uniqueVersionWitnesses: 38, pathOccurrences: 152, exactVersionsPresentInCandidate: 24, absentOrDifferentCandidateVersions: 14 });
  assert.throws(() => recoverPublishedVersionWitnesses(Buffer.concat([bytes, Buffer.from([0])]), lock));
});
test("fourteen dependency differences remain explicit, with no complete historical graph, new compiler result or conversion claim", () => {
  assert.deepEqual(proof.witnesses.filter(row => !row.exactVersionPresentInCandidate).map(row => row.name),
    ["arrayvec", "bitvec", "bytemuck", "bytes", "flate2", "jpeg-decoder", "miniz_oxide", "serde_json", "simplecss", "slotmap", "smallvec", "tinyvec", "unicode-bidi", "weezl"]);
  const json = proof.witnesses.find(row => row.name === "serde_json");
  assert.equal(json.version, "1.0.115"); assert.deepEqual(json.candidateVersions, ["1.0.154"]);
  assert.match(proof.scope, /not a complete Cargo graph/);
  for (const field of ["completeHistoricalDependencyGraphRecovered", "candidateChanged", "compilerRerun", "publicEngineChanged", "browserOrMemoryAcceptance", "originalGoalComplete"])
    assert.equal(proof[field], false, field);
});
test("static section walker refuses truncated lengths, bad magic and out-of-bounds payloads", () => {
  assert.deepEqual(wasmSections(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])), []);
  for (const bytes of [Buffer.alloc(8), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 11]),
    Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 11, 1]), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 11, 128, 128, 128, 128, 128, 0])])
    assert.throws(() => wasmSections(bytes));
});
test("actual static inventory is source-pinned and never invokes a renderer, compiler or media fixture", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest);
  const source = (await read("scripts/audit-resvg-version-witnesses.mjs")).toString();
  assert.match(source, /assert.equal\(process.argv.length, 2\)/); assert.match(source, /flag: "wx"/);
  assert.doesNotMatch(source, /spawn|execFile|rustup|cargo build|test\.mkv|\.instantiate/);
});
test("next postprocessor is checksum/source pinned as a build tool, never mislabelled a source-built conversion engine", async () => {
  const pin = JSON.parse(await read("images/resvg-source/bindgen-toolchain.json"));
  const report = JSON.parse(await read("evidence/2026-10-27-bindgen-toolchain-pin.json"));
  const metadata = JSON.parse(await read("evidence/2026-10-27-engine-source-provenance.json"));
  assert.equal(pin.version, "0.2.92"); assert.equal(pin.sourceCommit, report.officialSourceCommit);
  assert.ok(metadata.svgSourceGap.publishedWasmProducerWasmBindgen.includes(pin.sourceCommit.slice(0, 9)));
  assert.equal(pin.archiveBytes, report.downloadBytes); assert.equal(pin.archiveSha256, report.archiveSha256);
  assert.equal(report.officialReleaseChecksumMatched, true);
  assert.ok(report.archiveEntries.includes(pin.executableMember));
  assert.ok(pin.archiveBytes <= pin.maximumCompressedBytes && report.expandedTarBytes <= pin.maximumExpandedBytes);
  assert.equal(report.firstArchiveListing.status, "failed"); assert.equal(report.correctedArchiveListing, "passed");
  assert.equal(report.archiveExtractedOrWrittenToDisk, false);
  for (const flag of ["toolExecuted", "toolSourceIndependentlyCompiled", "compilerJobResultImplied", "publicEngineChanged", "browserOrMemoryAcceptance", "originalGoalComplete"])
    assert.equal(report[flag], false, flag);
});
