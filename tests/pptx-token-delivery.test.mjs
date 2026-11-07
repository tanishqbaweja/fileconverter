import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import { preparePptxTokenDeliverySources, tokenDeliveryPlugin } from "../scripts/lib/pptx-token-delivery-overlay.mjs";

const [docx, pptx] = await Promise.all(["workers/docx-conversion.ts", "workers/pptx-namespace-candidate.ts"].map(file => readFile(file)));
const implementations = {};
for (const mode of ["iterator", "callback"]) {
  const sources = preparePptxTokenDeliverySources(docx, pptx, mode);
  const result = await build({ entryPoints: ["workers/docx-conversion.ts"], bundle: true, format: "esm", write: false,
    platform: "browser", plugins: [tokenDeliveryPlugin({ root: process.cwd(), sources })] });
  const bundledLexer = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
  implementations[mode] = bundledLexer.consumeMarkupTokens;
}
const runtime = { assertActive() {}, progress() {} };
const encoder = new TextEncoder();
function stream(chunks) {
  let reads = 0, cancelled = false;
  const source = new ReadableStream({
    pull(controller) {
      if (reads === chunks.length) controller.close();
      else controller.enqueue(chunks[reads++]);
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { source, stats: () => ({ reads, cancelled, locked: source.locked }) };
}
const deferred = () => Promise.withResolvers();

for (const [mode, consume] of Object.entries(implementations)) {
  test(`${mode} cannot read past a suspended sink and preserves token order`, async () => {
    const input = stream(["<r>", "<x/>", "</r>"].map(value => encoder.encode(value)));
    const first = deferred(), write = deferred();
    const seen = [];
    const result = consume(input.source, runtime, "PPTX", token => {
      seen.push(token.value);
      if (seen.length === 1) { first.resolve(); return write.promise; }
    });
    await first.promise;
    assert.deepEqual(input.stats(), { reads: 1, cancelled: false, locked: true });
    assert.deepEqual(seen, ["<r>"]);
    write.resolve();
    await result;
    assert.deepEqual(seen, ["<r>", "<x/>", "</r>"]);
    assert.deepEqual(input.stats(), { reads: 3, cancelled: false, locked: false });
  });
  test(`${mode} releases and cancels its reader on synchronous throw or rejected backpressure`, async () => {
    for (const reject of [false, true]) {
      const input = stream(["<r>", "unread", "</r>"].map(value => encoder.encode(value)));
      const failure = new Error("bounded write failed");
      await assert.rejects(consume(input.source, runtime, "PPTX", () => {
        if (reject) return Promise.reject(failure);
        throw failure;
      }), error => error === failure);
      assert.deepEqual(input.stats(), { reads: 1, cancelled: true, locked: false });
    }
  });
  test(`${mode} preserves UTF-8, CDATA, and entity token boundaries through one-byte reads`, async () => {
    const input = stream(Array.from(encoder.encode('<r>A&amp;😀<![CDATA[β]]></r>'), byte => Uint8Array.of(byte)));
    const tokens = [];
    await consume(input.source, runtime, "PPTX", token => { tokens.push(token); });
    assert.deepEqual(tokens, [
      { kind: "start", value: "<r>" },
      { kind: "text", value: "A&amp;😀", cdata: false },
      { kind: "text", value: "β", cdata: true },
      { kind: "end", value: "</r>" },
    ]);
  });
}

test("the pair changes only the lexer delivery call and rejects unreviewed sources", () => {
  const control = preparePptxTokenDeliverySources(docx, pptx, "iterator");
  const treatment = preparePptxTokenDeliverySources(docx, pptx, "callback");
  assert.equal(control.parser, treatment.parser);
  assert.equal(treatment.lexer.replace("readMarkupTokens(source, runtime, formatLabel, sink)",
    "readMarkupTokens(source, runtime, formatLabel)"), control.lexer);
  assert.throws(() => preparePptxTokenDeliverySources(Buffer.concat([docx, Buffer.from("\n")]), pptx, "callback"));
  assert.throws(() => preparePptxTokenDeliverySources(docx, pptx, "unreviewed"));
});

test("the retained same-settings browser pair is byte-exact and faster, but the callback cleanup miss withholds it", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const read = file => readFile(new URL("../" + file, import.meta.url));
  const reports = await Promise.all([
    "2026-11-07T19-03-46-916Z-pptx-token-iterator",
    "2026-11-07T19-05-48-761Z-pptx-token-callback",
  ].map(async name => JSON.parse(await read(`evidence/${name}.json`))));
  const [control, treatment] = reports;
  assert.deepEqual(control.browserBefore, treatment.browserBefore);
  assert.deepEqual(control.sourcePins, treatment.sourcePins);
  assert.deepEqual(control.build, treatment.build);
  assert.deepEqual(control.largeFixture, treatment.largeFixture);
  assert.notEqual(control.browserIdentity.createdAt, treatment.browserIdentity.createdAt);
  assert.deepEqual(reports.map(r => r.tokenDelivery.mode), ["iterator", "callback"]);
  assert.equal(control.tokenDelivery.candidateParserSha256, treatment.tokenDelivery.candidateParserSha256);
  assert.notEqual(control.tokenDelivery.lexerSha256, treatment.tokenDelivery.lexerSha256);
  assert.equal(control.tokenDelivery.originalAssetSha256, treatment.tokenDelivery.originalAssetSha256);
  for (const report of reports) {
    assert.equal(report.status, "completed-token-delivery-diagnostic-not-acceptance");
    assert.equal(report.diagnosticOnly, true);
    assert.equal(report.traceScreenshots, false);
    assert.equal(report.browserServicesDisabled, false);
    assert.equal(report.tokenDelivery.fulfilledRequests, 4);
    assert.equal(report.tokenDelivery.singleSourceFactorVerified, true);
    assert.equal(report.tokenDelivery.shippedAssetUnchanged, true);
    assert.equal(report.ownedRuntimeRemoved, true);
    assert.equal(report.browserCleanup.status, "owned-observed-pids-absent");
    assert.equal(report.serverCleanup.ownedRootAbsent, true);
    assert.deepEqual(report.protectedOriginalBefore, report.protectedOriginalAfter);
    assert.deepEqual(report.forbiddenRequests, []);
    assert.deepEqual(report.cases.map(row => row.kind), ["native", "large-1", "large-2"]);
    assert.equal(report.cases[0].validation.independentShapeGroupTableAndHiddenTextMatch, true);
    for (const row of report.cases.slice(1)) {
      assert.equal(row.metrics.inputBytes, 135296355);
      assert.equal(row.validation.bytes, 92391679);
      assert.equal(row.validation.sha256, report.largeFixture.expectedByProfile["pptx-to-txt"].validationSha256);
      assert.equal(row.metrics.peakPendingOperations, 1);
      assert.equal(row.metrics.peakQueuedBytes, 262144);
    }
    const packed = await read(report.nativeArchive.path);
    assert.equal(sha(packed), report.nativeArchive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 4 * 1024 * 1024 });
    assert.equal(sha(raw), report.nativeArchive.decodedSha256);
    const peak = JSON.parse(raw).find(row => row.sequence === report.memory.peak.sequence);
    assert.equal(peak.privateBytes, peak.processes.reduce((sum, proc) => sum + proc.privateBytes, 0));
    assert.equal((peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, report.memory.incrementalPrivateMiB);
    assert.ok(report.memory.incrementalPrivateMiB <= 250);
  }
  const mean = r => r.cases.slice(1).reduce((ms, row) => ms + row.metrics.elapsedMs, 0) / 2;
  assert.ok(1 - mean(treatment) / mean(control) > 0.18);
  assert.deepEqual(control.cases.map(row => row.cleanupGatePassed), [true, true, true]);
  assert.deepEqual(treatment.cases.map(row => row.cleanupGatePassed), [true, true, false]);
  assert.equal(treatment.cases[2].memory.cleanupDeltaFromLoadedMiB, 135.359375);
});
