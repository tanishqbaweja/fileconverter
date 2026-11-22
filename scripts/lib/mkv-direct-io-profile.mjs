// Qualification-only localhost JavaScript wrapper. No I/O substitution, byte
// mutation, retained payloads, network reporting or public benchmark claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { withMkvReadFill } from "./mkv-byob-read-fill.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const warningPrefix = "MKV_IO_PROFILE_V1 ";

// Self-contained so the same function is tested here and embedded verbatim.
export async function instrumentMkvIoFactory(factory, options, now = () => performance.now(), fileProto = globalThis.FileSystemWritableFileStream.prototype) {
  const bridge = options.withinBridge;
  if (!bridge || bridge.readSync || bridge.writeSync || bridge.copyOutput || typeof fileProto.write !== "function" || typeof fileProto.close !== "function")
    throw new Error("MKV I/O attribution requires the corrected asynchronous production bridge");
  const bucket = () => ({ calls: 0, bytes: 0, ms: 0, maxMs: 0 });
  const read = bucket(), write = bucket(), fileWrite = bucket(), trim = bucket(), flush = bucket(), close = bucket();
  let pending = 0, peakPending = 0, nativeMs = 0, nativeResult, start, positionalFileWrites = 0;
  let closeReported = false;
  const account = (bin, t) => {
    const ms = now() - t;
    bin.calls++; bin.ms += ms; bin.maxMs = Math.max(bin.maxMs, ms);
  };
  const io = (name, bin, bytes) => async function (...args) {
    const t = now();
    peakPending = Math.max(peakPending, ++pending);
    try {
      const result = await Reflect.apply(bridge[name], bridge, args);
      bin.bytes += bytes(result, args);
      return result;
    } finally { account(bin, t); pending--; }
  };
  const descriptors = ["write", "close"].map(name => [name, Object.getOwnPropertyDescriptor(fileProto, name), fileProto[name]]);
  const restore = () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(fileProto, name, descriptor);
      else delete fileProto[name];
    }
  };
  const replacement = { ...bridge,
    read: io("read", read, result => Math.max(0, result)),
    write: io("write", write, (_result, args) => args[1].byteLength),
    ...(bridge.truncate ? { truncate: io("truncate", trim, () => 0) } : {}),
    ...(bridge.flush ? { flush: io("flush", flush, () => 0) } : {}),
  };
  const initialized = now(), native = await factory({ ...options, withinBridge: replacement }), initializeMs = now() - initialized;
  const ccall = native.ccall;
  native.ccall = async function (name, ...args) {
    if (name !== "within_remux" || start !== undefined) throw new Error("Unexpected extra native call in MKV I/O attribution");
    start = now();
    try { nativeResult = await Reflect.apply(ccall, this, [name, ...args]); return nativeResult; }
    finally { nativeMs = now() - start; if (nativeResult !== 0) restore(); }
  };
  Object.defineProperty(fileProto, "write", { configurable: true, writable: true, value: async function (value) {
    const t = now(), positional = value?.type === "write";
    try {
      const result = await Reflect.apply(descriptors[0][2], this, [value]);
      if (positional) positionalFileWrites++;
      fileWrite.bytes += (positional ? value.data : value).byteLength;
      return result;
    } finally { account(fileWrite, t); }
  } });
  Object.defineProperty(fileProto, "close", { configurable: true, writable: true, value: async function () {
    const t = now();
    try {
      const result = await Reflect.apply(descriptors[1][2], this, []);
      account(close, t);
      if (!closeReported && nativeResult === 0) {
        closeReported = true;
        bridge.message(1, "MKV_IO_PROFILE_V1 " + JSON.stringify({ initializeMs, nativeMs, peakPending, positionalFileWrites,
          read, write, fileWrite, trim, flush, close }));
      }
      return result;
    } finally { restore(); }
  } });
  return native;
}

export function buildMkvIoProfileModule(bytes, expectedSha256, byobMode) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 131072);
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  assert.equal(sha(bytes), expectedSha256);
  const source = bytes.toString("utf8"), anchor = "export default createWithinRemuxCore;";
  assert.deepEqual(Buffer.from(source, "utf8"), bytes);
  assert.equal(source.split(anchor).length, 2, "Diagnostic can only wrap the exact authenticated native factory export");
  assert.ok(byobMode === undefined || byobMode === "control" || byobMode === "fill");
  const input = byobMode === "fill" ? `(${withMkvReadFill.toString()})(options)` : "options";
  const patch = `export default options => (${instrumentMkvIoFactory.toString()})(createWithinRemuxCore, ${input});`;
  const out = source.replace(anchor, () => patch);
  assert.equal(out.replace(patch, () => anchor), source);
  const body = Buffer.from(out, "utf8");
  return { body, proof: { originalModuleSha256: expectedSha256, instrumentedModuleSha256: sha(body), instrumentedModuleBytes: body.length,
    workerReplaced: false, wasmBytesChanged: false, productionAcceptance: false, scope: "timing diagnostic; JavaScript overhead is included",
    ...(byobMode ? { byobMode } : {}) } };
}

export function readMkvIoProfile(warnings, metrics, inputBytes) {
  const record = JSON.parse(extractMkvIoProfile(warnings));
  assert.deepEqual(Object.keys(record), ["initializeMs", "nativeMs", "peakPending", "positionalFileWrites", "read", "write", "fileWrite", "trim", "flush", "close"]);
  for (const name of ["read", "write", "fileWrite", "trim", "flush", "close"]) {
    const b = record[name];
    assert.deepEqual(Object.keys(b), ["calls", "bytes", "ms", "maxMs"]);
    for (const key of ["calls", "bytes"]) assert.ok(Number.isSafeInteger(b[key]) && b[key] >= 0);
    for (const key of ["ms", "maxMs"]) assert.ok(Number.isFinite(b[key]) && b[key] >= 0);
    assert.ok(b.maxMs <= b.ms + 0.01);
  }
  assert.equal(record.peakPending, 1, "Bridge intervals must not overlap before subtracting their time");
  // AVIO measures bytes requested by the demuxer, which can seek past
  // container bookkeeping or reread bytes. The independent full-file
  // source/output checks, not this counter, establish media integrity.
  assert.ok(Number.isSafeInteger(inputBytes) && inputBytes > 0);
  assert.ok(record.read.calls > 0 && record.read.bytes > 0 && record.read.bytes <= record.read.calls * 262144);
  assert.ok(record.write.calls > 0 && record.write.bytes > 0 && record.write.bytes <= record.write.calls * 1048576);
  assert.equal(record.fileWrite.calls, record.write.calls); assert.equal(record.fileWrite.bytes, record.write.bytes);
  assert.equal(record.close.calls, 1);
  assert.ok(Number.isSafeInteger(record.positionalFileWrites) && record.positionalFileWrites >= 0 && record.positionalFileWrites <= record.fileWrite.calls);
  assert.ok(Number.isFinite(record.initializeMs) && record.initializeMs >= 0);
  assert.ok(Number.isFinite(record.nativeMs) && record.nativeMs > 0);
  const callbackMs = record.read.ms + record.write.ms + record.trim.ms + record.flush.ms;
  assert.ok(callbackMs <= record.nativeMs + 0.02);
  assert.ok(record.fileWrite.ms <= record.write.ms + 0.02);
  const otherJobMs = metrics.elapsedMs - record.initializeMs - record.nativeMs - record.close.ms;
  assert.ok(Number.isFinite(otherJobMs) && otherJobMs >= -0.02);
  return { ...record, callbackMs, nativeOutsideTimedCallbacksMs: record.nativeMs - callbackMs,
    bridgeWriteOutsideFileApiMs: record.write.ms - record.fileWrite.ms, otherJobMs, elapsedMs: metrics.elapsedMs,
    sourceFileBytes: inputBytes, outputFileBytes: metrics.outputBytes };
}

export function extractMkvIoProfile(warnings) {
  const records = warnings.filter(s => s.startsWith(warningPrefix));
  assert.equal(records.length, 1);
  const json = records[0].slice(warningPrefix.length);
  assert.ok(json.length <= 1200 && /^[0-9A-Za-z.,:"{}+ -]+$/.test(json), "Bounded numeric diagnostic only");
  const parsed = JSON.parse(json);
  const names = ["initializeMs", "nativeMs", "peakPending", "positionalFileWrites", "read", "write", "fileWrite", "trim", "flush", "close"];
  assert.deepEqual(Object.keys(parsed), names);
  for (const key of names.slice(0, 4)) assert.ok(Number.isFinite(parsed[key]));
  for (const key of names.slice(4)) {
    assert.deepEqual(Object.keys(parsed[key]), ["calls", "bytes", "ms", "maxMs"]);
    for (const value of Object.values(parsed[key])) assert.ok(Number.isFinite(value));
  }
  return json;
}
