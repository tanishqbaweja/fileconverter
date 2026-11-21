import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isTimedTextQualification, requirePrivateTimedTextSelection, timedTextTrackChoices,
} from "../lib/timed-text-qualification.ts";
import { conversionProfiles, privateQualificationProfiles, publicProfilesFor } from "../lib/capability-registry.ts";
import { preTimedTextIntegration } from "../scripts/lib/reviewed-timed-text-integration.mjs";

test("timed-text sidecar routes remain absent from the public and automatic profile lists", () => {
  for (const input of ["mp4", "mov", "3gp"]) {
    const id = `${input}-to-vtt`;
    assert.equal(isTimedTextQualification(id), true);
    assert.equal(conversionProfiles.some(profile => profile.id === id), false);
    const entry = privateQualificationProfiles.find(profile => profile.id === id);
    assert.equal(entry.public, false);
    assert.equal(entry.automatedTestStatus, "pending");
    assert.equal(entry.maxTestedBytes, null);
    assert.equal(publicProfilesFor(input).some(profile => profile.id === id), false);
    assert.equal(publicProfilesFor(input, true).some(profile => profile.id === id), true);
  }
  assert.equal(isTimedTextQualification("srt-to-vtt"), false);
});

test("only unambiguous timed-text IDs from the selected source may be offered", () => {
  const streams = [
    { isoTrackId: 3, mediaType: "video" },
    { isoTrackId: 14, mediaType: "subtitle", isoSubtitleSampleEntry: "tx3g", languageTag: "spa" },
    { isoTrackId: 18, mediaType: "subtitle", isoSubtitleSampleEntry: "wvtt", languageTag: "fra" },
    { isoTrackId: 23, mediaType: "subtitle", isoSubtitleSampleEntry: "tx3g" },
    { isoTrackId: 23, mediaType: "audio" },
    { isoTrackId: 0, mediaType: "subtitle", isoSubtitleSampleEntry: "tx3g" },
  ];
  assert.deepEqual(timedTextTrackChoices(streams), [{ id: 14, label: "Stream 2 · track 14 · spa" }]);
});

test("worker request rejects nonlocal, unspecified or unsupported destinations", () => {
  assert.equal(requirePrivateTimedTextSelection("127.0.0.1", 0xffffffff, "handle"), 0xffffffff);
  assert.equal(requirePrivateTimedTextSelection("[::1]", 9, "opfs-test"), 9);
  for (const hostname of ["127.0.0.1.example.invalid", "example.invalid", ""]) {
    assert.throws(() => requirePrivateTimedTextSelection(hostname, 2, "handle"), /restricted to local qualification/);
  }
  for (const id of [undefined, null, 0, -1, 4294967296, 4.1, "4", NaN]) {
    assert.throws(() => requirePrivateTimedTextSelection("localhost", id, "handle"), /Choose an explicit/);
  }
  assert.throws(() => requirePrivateTimedTextSelection("localhost", 3, "staged-handle"), /direct or owned local test destination/);
});

test("live app and worker source retain source-bound selection and bounded direct dispatch", async () => {
  const [app, worker] = await Promise.all([readFile("app/converter/ConverterApp.tsx", "utf8"), readFile("workers/conversion.worker.ts", "utf8")]);
  for (const anchor of ["testMode && isTimedTextQualification(selectedProfile?.id)",
    "timedTextSource.file === file", "timedTextSelection.file === file",
    'data-testid="timed-text-track-select"', "files.length !== 1 || selectedTimedTextTrackId === undefined",
    "timedTextTrackId: batch.timedTextTrackId"]) assert.ok(app.includes(anchor), anchor);
  assert.ok(worker.indexOf("requirePrivateTimedTextSelection(workerScope.location.hostname") <
    worker.indexOf("destination = await openDestination("));
  for (const anchor of ['await import("./iso-timed-text-webvtt")',
    "metrics.inputBytes += bytes.byteLength", "startedAt, true, TIMED_TEXT_WRITE_BYTES",
    "await destination.writable.close()", "await destination?.writable.abort(error)"]) assert.ok(worker.includes(anchor), anchor);
});

test("only exact reviewed current bytes map back to their historical preimage", async () => {
  for (const file of ["app/converter/ConverterApp.tsx", "workers/conversion.worker.ts",
    "lib/capability-registry.ts", "lib/conversion-protocol.ts", "lib/media-source-inspection.ts"]) {
    const current = await readFile(file);
    const archived = preTimedTextIntegration(file, current);
    assert.notDeepEqual(archived, current);
    assert.equal(preTimedTextIntegration(file, archived), archived);
    const unknown = Buffer.concat([current, Buffer.from("\n// unknown edit\n")]);
    assert.equal(preTimedTextIntegration(file, unknown), unknown);
  }
});
