import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { assertTimedTextLaunch, assertTimedTextTerminal, classifyTimedTextBrowserRequest, collectTimedTextStaticPaths,
  resolveTimedTextBrowserRun, summarizeTimedTextMemory, validateTimedTextPhysicalOutput } from "../scripts/lib/timed-text-browser-control.mjs";

test("one explicit supported ISO-BMFF container per measured Chrome session", () => {
  for (const container of ["mp4", "mov", "3gp"]) {
    assert.deepEqual(resolveTimedTextBrowserRun([`--container=${container}`]), { container, profileId: `${container}-to-vtt`, preflightOnly: false });
  }
  assert.equal(resolveTimedTextBrowserRun([]).profileId, "mp4-to-vtt");
  assert.equal(resolveTimedTextBrowserRun(["--preflight"]).preflightOnly, true);
  for (const args of [["--container=mkv"], ["--container=mov", "--container=3gp"], ["--preflight", "--container=mov"]]) {
    assert.throws(() => resolveTimedTextBrowserRun(args));
  }
});

test("request guard permits only shipped assets and exact loopback test navigations", async () => {
  const scratch = await createOwnedRuntimeScratch("timed-text-requests-");
  try {
    await mkdir(path.join(scratch.directory, "assets"));
    await writeFile(path.join(scratch.directory, "assets", "abc.js"), "// fixture", { flag: "wx" });
    await writeFile(path.join(scratch.directory, "_headers"), "test config", { flag: "wx" });
    const assets = await collectTimedTextStaticPaths(scratch.directory);
    assert.deepEqual([...assets], ["/assets/abc.js"]);
    const origin = "http://127.0.0.1:9900";
    const check = (url, options) => classifyTimedTextBrowserRequest({ method: "GET", url: new URL(url, origin).href, ...options }, origin, assets);
    assert.equal(check("/assets/abc.js"), "app-static");
    assert.equal(check("/?test=1&directory=1&fault=write"), "app-static");
    for (const url of ["/assets/abc.js?file=example", "/assets/unknown.js", "/assets/within-test-timed-text-cancellation.mp4",
      "/?test=1&directory=1&payload=track", "/_headers", "https://example.invalid/assets/abc.js"]) {
      assert.equal(check(url), "forbidden", url);
    }
    assert.equal(check("/assets/abc.js", { method: "POST" }), "forbidden");
    assert.equal(check("/assets/abc.js", { postData: "cue" }), "forbidden");
  } finally { await scratch.close(); }
  await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
});

test("physical output validator rejects same-size byte changes, truncation and extra bytes", async () => {
  const scratch = await createOwnedRuntimeScratch("timed-text-oracle-");
  try {
    const original = Buffer.from("WEBVTT\n\n00:00:00.100 --> 00:00:00.600\n" + "世界 &amp; 😀 ".repeat(6000) + "\n\n");
    const expected = { bytes: original.length, sha256: createHash("sha256").update(original).digest("hex") };
    const target = path.join(scratch.directory, "known.vtt");
    await writeFile(target, original, { flag: "wx" });
    assert.deepEqual(await validateTimedTextPhysicalOutput(target, expected), { ...expected, maximumReadBytes: 65536 });
    const changed = Buffer.from(original); changed[23] ^= 1;
    for (const [name, bytes, error] of [["changed", changed, /oracle/], ["short", original.subarray(0, -1), /Truncated/],
      ["long", Buffer.concat([original, Buffer.from("x")]), /extra/]]) {
      const file = path.join(scratch.directory, `${name}.vtt`);
      await writeFile(file, bytes, { flag: "wx" });
      await assert.rejects(validateTimedTextPhysicalOutput(file, expected), error);
    }
  } finally { await scratch.close(); }
  await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
});

test("browser proof rejects a wrong track, staged handle and optimistic terminal metrics", () => {
  const fixture = { inputBytes: 2848610, container: "mp4" };
  const launch = { jobId: "genuine-1", profileId: "mp4-to-vtt", sourceBytes: fixture.inputBytes, trackId: 4, mode: "handle", actualFileHandle: true, fault: null };
  assert.doesNotThrow(() => assertTimedTextLaunch(launch, fixture, 4));
  assert.throws(() => assertTimedTextLaunch({ ...launch, trackId: 3 }, fixture, 4));
  assert.throws(() => assertTimedTextLaunch({ ...launch, mode: "staged-handle" }, fixture, 4));
  assert.throws(() => assertTimedTextLaunch({ ...launch, profileId: "mov-to-vtt" }, fixture, 4));
  const metrics = { inputBytes: 1910727, outputBytes: 2155445, maxReadChunkBytes: 16384, maxWriteChunkBytes: 65536,
    peakQueuedBytes: 65536, peakPendingOperations: 1, pendingOperations: 0, queuedBytes: 0, peakWasmMemoryBytes: 0 };
  const state = { jobState: "complete", selectedProfileId: "mp4-to-vtt", opfsName: null, error: null, metrics };
  assert.doesNotThrow(() => assertTimedTextTerminal(state, "complete", metrics.outputBytes));
  assert.throws(() => assertTimedTextTerminal(state, "complete", metrics.outputBytes, "3gp-to-vtt"));
  assert.throws(() => assertTimedTextTerminal({ ...state, metrics: { ...metrics, pendingOperations: 1 } }, "complete", metrics.outputBytes));
  assert.throws(() => assertTimedTextTerminal({ ...state, metrics: { ...metrics, maxWriteChunkBytes: 65537 } }, "complete", metrics.outputBytes));
  assert.throws(() => assertTimedTextTerminal({ ...state, jobState: "cancelled" }, "cancelled", metrics.outputBytes));
  assert.doesNotThrow(() => assertTimedTextTerminal({ ...state, jobState: "cancelled", metrics: { ...metrics, outputBytes: 131071 } }, "cancelled", metrics.outputBytes));
  const err = { ...state, jobState: "error", error: "The destination rejected a bounded write.", metrics: { ...metrics, outputBytes: 0 } };
  assert.doesNotThrow(() => assertTimedTextTerminal(err, "error", metrics.outputBytes));
  assert.throws(() => assertTimedTextTerminal({ ...err, error: "No track selected" }, "error", metrics.outputBytes));
});

test("whole-tree memory keeps missing samples unavailable and never rebases against the loaded page", () => {
  const mib = 1048576;
  const row = (timestamp, value) => ({ timestamp: new Date(timestamp).toISOString(), privateBytes: value, rssBytes: value });
  const samples = [row(50, 126 * mib), row(150, 550 * mib), row(250, null), row(350, 420 * mib), row(500, 1000 * mib)];
  const blank = { stable: true, privateBytes: 300 * mib }, loaded = { stable: true, privateBytes: 510 * mib };
  const result = summarizeTimedTextMemory(samples, 100, 400, blank, loaded);
  assert.equal(result.incrementalPrivateMiB, 250);
  assert.equal(result.overLoadedIdleMiB, 40);
  assert.equal(result.validSamples, 2);
  assert.equal(result.unavailableSamples, 1);
  assert.equal(result.maxSampleGapMs, 200);
  assert.throws(() => summarizeTimedTextMemory(samples, 200, 300, blank, loaded));
  assert.throws(() => summarizeTimedTextMemory([samples[3], samples[1]], 100, 400, blank, loaded));
});
