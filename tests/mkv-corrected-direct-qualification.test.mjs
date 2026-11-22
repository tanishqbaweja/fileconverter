import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { CORRECTED_DIRECT_MKV_CORE, CORRECTED_DIRECT_MKV_WRITE_BYTES, requireCorrectedDirectMkvQualification } from "../lib/mkv-corrected-direct-qualification.ts";
import { publicProfilesFor, temporarilyWithheldProfilesFor } from "../lib/capability-registry.ts";
import { loadQualifiedHeaderDirectAssets } from "../scripts/lib/mkv-header-native-cache.mjs";
import { preMkvCorrectedDirectIntegration } from "../scripts/lib/reviewed-mkv-corrected-direct.mjs";

const root = path.resolve(import.meta.dirname, "..");
const built = await build({ absWorkingDir: root, entryPoints: ["workers/mkv-corrected-direct-output.ts"], bundle: true,
  format: "esm", write: false, platform: "browser" });
const { openCorrectedDirectMkvOutput, reuseCorrectedDirectMkvOutput } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64"));
const limit = CORRECTED_DIRECT_MKV_WRITE_BYTES;
const read = name => readFile(path.join(root, name));

test("corrected direct mode is explicit, private, and refuses remote and mismatched requests before opening a destination", async () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    assert.equal(requireCorrectedDirectMkvQualification(true, host, "mkv-to-mp4", "handle"), true);
  for (const args of [[true, "localhost.example.com", "mkv-to-mp4", "handle"], [true, "localhost", "mkv-to-webm", "handle"],
    [true, "localhost", "mkv-to-mp4", "staged-handle"], [true, "localhost", "mkv-to-mp4", "opfs-test"],
    ["true", "localhost", "mkv-to-mp4", "handle"], [false, "localhost", "mkv-to-mp4", "handle"]]) {
    assert.throws(() => requireCorrectedDirectMkvQualification(...args), /requires localhost/);
  }
  assert.equal(requireCorrectedDirectMkvQualification(undefined, "example.com", "mkv-to-mp4", "handle"), false);
  assert.ok(temporarilyWithheldProfilesFor("mkv").some(profile => profile.id === "mkv-to-mp4"));
  assert.ok(!publicProfilesFor("mkv").some(profile => profile.id === "mkv-to-mp4"));
  const [app, worker, remux] = (await Promise.all([read("app/converter/ConverterApp.tsx"), read("workers/conversion.worker.ts"), read("workers/media-remux.ts")])).map(bytes => bytes.toString());
  assert.match(app, /testCorrectedDirectMkv = testDirectoryMode/);
  assert.match(app, /!usesStagedOutput\(batch\.profile\.id, batch\.correctedDirectMkv\)/);
  const guard = worker.indexOf("requireCorrectedDirectMkvQualification(message.correctedDirectMkv");
  assert.ok(guard > 0 && guard < worker.indexOf("destination = { writable: await openCorrectedDirectMkvOutput("));
  assert.ok(guard < worker.indexOf("destination = await openDestination("));
  assert.match(worker, /if \(correctedDirectMkv\) destination\.writable\.maximumWriteBytes = maximumWriteBytes/);
  assert.match(remux, /correctedDirectMkv\s*\? CORRECTED_DIRECT_MKV_CORE\.module/);
  assert.match(remux, /correctedDirectMkv\s*\? CORRECTED_DIRECT_MKV_CORE\.wasm/);
});

test("a failed initial truncate aborts the actual file-stream transaction before returning a destination", async () => {
  const failure = new DOMException("cannot truncate", "QuotaExceededError");
  let aborts = 0;
  await assert.rejects(openCorrectedDirectMkvOutput({ async createWritable(options) {
    assert.deepEqual(options, { keepExistingData: false });
    return { async truncate(size) { assert.equal(size, 0); throw failure; }, async abort(error) {
      assert.equal(error, failure); aborts++;
    } };
  } }), error => error === failure);
  assert.equal(aborts, 1);
});

test("the normal worker adapter copies shared native bytes into one unshared slot and preserves large and backward offsets", async () => {
  let release, slot, held, starts = 0, closed = false;
  const offsets = [], captured = [];
  const gate = new Promise(resolve => { release = resolve; });
  const destination = reuseCorrectedDirectMkvOutput({ requiresOwnedWriteBuffer: true, maximumWriteBytes: limit,
    async write({ position, data }) {
      starts++; slot ??= data.buffer; assert.equal(slot, data.buffer); assert.ok(slot instanceof ArrayBuffer && slot.byteLength === limit);
      held = data; offsets.push(position); await gate; captured.push([...data]);
    },
    async truncate(size) { assert.equal(size, 2 ** 32 + 200); },
    async close() { closed = true; },
    async abort() { assert.fail("unexpected abort"); },
  });
  assert.equal(destination.maximumWriteBytes, limit);
  assert.equal(destination.requiresOwnedWriteBuffer, false);
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  const source = new Uint8Array(memory.buffer, 5, 4); source.set([3, 4, 5, 6]);
  const inflight = destination.write({ type: "write", position: 2 ** 32 + 1, data: source });
  await assert.rejects(destination.write(new Uint8Array([1])), /one write at a time/);
  await assert.rejects(destination.close(), /not ready/);
  await assert.rejects(destination.truncate(0), /Invalid/);
  source.fill(0); assert.deepEqual([...held], [3, 4, 5, 6]);
  release(); await inflight;
  await destination.write({ type: "write", position: 7, data: new Uint8Array([1, 3]) });
  await destination.truncate(2 ** 32 + 200);
  await destination.close();
  assert.ok(closed); assert.equal(starts, 2);
  assert.deepEqual(offsets, [2 ** 32 + 1, 7]); assert.deepEqual(captured, [[3, 4, 5, 6], [1, 3]]);
});

test("malformed writes never touch the sink; a quota failure reaches one terminal abort", async () => {
  const fault = new DOMException("test quota", "QuotaExceededError");
  let targetCalls = 0, aborted = 0;
  const destination = reuseCorrectedDirectMkvOutput({ requiresOwnedWriteBuffer: true, maximumWriteBytes: limit,
    async write() { targetCalls++; throw fault; }, async close() { assert.fail("unexpected commit"); }, async truncate() { assert.fail("unexpected truncate"); },
    async abort(error) { aborted++; assert.equal(error, fault); },
  });
  for (const [position, length] of [[-1, 1], [0, 0], [0, limit + 1], [Number.MAX_SAFE_INTEGER, 2]])
    await assert.rejects(destination.write({ type: "write", position, data: new Uint8Array(length) }), /size or address/);
  assert.equal(targetCalls, 0);
  await assert.rejects(destination.write(new Uint8Array([5])), error => error === fault);
  await destination.abort(fault); await destination.abort(fault);
  await assert.rejects(destination.write(new Uint8Array([5])), /one write at a time/);
  assert.equal(targetCalls, 1); assert.equal(aborted, 1);
});

test("the two dedicated localhost static URLs bind only the qualified core's exact bytes and ABI", async () => {
  const { assets, proof } = await loadQualifiedHeaderDirectAssets(root);
  assert.deepEqual([...assets.keys()], [CORRECTED_DIRECT_MKV_CORE.module, CORRECTED_DIRECT_MKV_CORE.wasm]);
  for (const [url, base] of [[CORRECTED_DIRECT_MKV_CORE.module, "within-direct.mjs"], [CORRECTED_DIRECT_MKV_CORE.wasm, "within-direct.wasm"]]) {
    const hash = createHash("sha256").update(assets.get(url).body).digest("hex");
    assert.equal(hash, proof.build.artifacts[base].sha256);
  }
  assert.ok(!assets.has("/engines/remux/within-direct.wasm"));
});

test("archived overlay comparisons accept only exact, reviewed current-to-historical pairs", async () => {
  for (const file of ["app/converter/ConverterApp.tsx", "workers/conversion.worker.ts", "workers/media-remux.ts", "lib/conversion-protocol.ts"]) {
    const current = await read(file), historical = preMkvCorrectedDirectIntegration(file, current);
    assert.notDeepEqual(current, historical);
    const unknown = Buffer.concat([current, Buffer.from("\n// unknown modification\n")]);
    assert.equal(preMkvCorrectedDirectIntegration(file, unknown), unknown);
    assert.equal(preMkvCorrectedDirectIntegration(file, historical), historical);
  }
});
