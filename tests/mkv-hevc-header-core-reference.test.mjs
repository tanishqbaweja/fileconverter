import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { headerParserH264Regression, assertHevcHeaderParserCore, readHevcHeaderLoopReference, hevcHeaderLoopReference, assertStartupDtsDisclosure } from "../scripts/lib/mkv-hevc-header-core-reference.mjs";

test("header-core override is explicit and admits only the three unchanged H264 controls, never original/HEVC or arbitrary profiles", () => {
  const modes = { "--h264-startup-no-b-control": "h264-no-b-frames", "--h264-startup-bframes": "h264-bframes", "--h264-startup-positive": "h264-positive-start" };
  assert.equal(headerParserH264Regression([]), null);
  for (const [mode, kind] of Object.entries(modes)) {
    assert.equal(headerParserH264Regression([mode, "43691831594", "a".repeat(40)]), null);
    assert.equal(headerParserH264Regression([mode, "43691831594", "a".repeat(40), "--hevc-header-parser-core"]), kind);
  }
  for (const mode of ["--h264-startup-hevc-control", "--h264-startup-protected", "--edit-list-aac-candidate", "__proto__"])
    assert.throws(() => headerParserH264Regression([mode, "1", "a".repeat(40), "--hevc-header-parser-core"]));
  assert.throws(() => headerParserH264Regression(["--h264-startup-positive", "1", "a".repeat(40), "--guess-core"]));
  assert.throws(() => headerParserH264Regression(["--h264-startup-positive", "1", "a".repeat(40), "--hevc-header-parser-core", "extra"]));
});

test("exact current HEVC loop proof is authenticated and reused without conversion replay or native-build equivalence guessing", async () => {
  const bytes = await readFile(hevcHeaderLoopReference.file), report = JSON.parse(bytes);
  const proof = readHevcHeaderLoopReference(bytes, report.candidateBuild);
  assert.equal(proof.exactCurrentNativeBuildVerified, true); assert.equal(proof.noConversionReplay, true);
  assert.throws(() => readHevcHeaderLoopReference(Buffer.from("changed evidence"), report.candidateBuild));
  for (const change of [
    t => { t.head = "a".repeat(40); }, t => { t.runId = "1"; },
    t => { t.build.artifacts["within-direct.wasm"].sha256 = "a".repeat(64); },
    t => { t.build.source.library.enabledDecoders.push("hevc"); },
    t => { t.build.source.hevcHeaderParser.decodedPicturesAdded = true; },
    t => { t.build.wasmMemory[0].maximumPages++; },
  ]) { const changed = structuredClone(report.candidateBuild); change(changed); assert.throws(() => assertHevcHeaderParserCore(changed)); }
});

test("production qualification preserves old core guards and unchanged H264 validators while routing the new compiled tools explicitly", async () => {
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(source, /headerParserH264Regression\(process.argv.slice\(2\)\)/);
  assert.match(source, /startupCore && !hevcKnownDts\) assertMkvStartupCore/);
  assert.match(source, /if \(headerH264Regression\) \{\r?\n      assertHevcHeaderParserCore\(candidate.proof\)/);
  assert.match(source, /hevcHeaderParser \? hevcKnownDtsWrapperSha256 : startupCore \? h264StartupWrapperSha256/);
  assert.match(source, /validation.packets = compareComplexMkvPackets\(baseline.complexPackets, outputComplexPackets\)/);
  assert.match(source, /Complete decoded VFR video or either AAC track changed/);
});

test("startup disclosure must match the exact documented message for the selected core, not just contain a permissive substring", () => {
  const old = "Missing initial H.264 decode timestamps reconstructed from bounded observed presentation cadence; existing PTS and known DTS are unchanged.";
  const corrected = old.replace("H.264", "H.264/HEVC");
  assert.deepEqual(assertStartupDtsDisclosure([old]), { exactMessageChecked: true, codecLabel: "H.264" });
  assert.deepEqual(assertStartupDtsDisclosure([corrected], true), { exactMessageChecked: true, codecLabel: "H.264/HEVC" });
  assert.throws(() => assertStartupDtsDisclosure([old], true)); assert.throws(() => assertStartupDtsDisclosure([corrected], false));
  assert.throws(() => assertStartupDtsDisclosure([]));
  for (const changed of [corrected.replace("known DTS are unchanged", "known DTS may change"), corrected.slice(0, 70), "hidden " + corrected])
    assert.throws(() => assertStartupDtsDisclosure([changed], true));
});
