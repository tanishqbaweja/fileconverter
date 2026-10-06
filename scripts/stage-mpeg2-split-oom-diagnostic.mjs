// Private failure-stack diagnostic. Actual Wasm, source pins, options and published assets unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), name = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR ?? "mpeg2-split-pipeline-output";
if (!/^(mpeg2-split-pipeline-output|mpeg2-split-pipeline-[0-9]{8,})$/.test(name)) throw new Error("Invalid private split tool slot");
const source = path.join(root, "work", name), target = path.join(root, "dist/client/engines/remux"), published = path.join(root, "public/engines/remux");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hash = async file => sha(await readFile(file));
const manifest = JSON.parse(await readFile(path.join(source, "build-manifest.json"), "utf8"));
assert.equal(manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(manifest.allowMemoryGrowth, false);
for (const [file, digest] of Object.entries(manifest.sources)) assert.equal(await hash(path.join(root, file)), digest, file);
for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(await hash(path.join(source, file)), digest, file);
assert.deepEqual(manifest.memories.decoderMux, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.deepEqual(manifest.memories.encoder, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
const adapter = `// PRIVATE_MPEG2_SPLIT_OOM_DIAGNOSTIC_NOT_PUBLIC_SUPPORT
import decoderFactory from "/engines/remux/_private_split_decoder.mjs";
import encoderFactory from "/engines/remux/_private_split_encoder.mjs";
import {createMpeg2SplitSession} from "/engines/remux/mpeg2-split-session.mjs";
import {createSplitAbortProbe} from "/engines/remux/split-abort-probe.mjs";
export default async function(options) {
  let encoder, session, core, maximumMediaAvioWriteBytes = 0;
  try {
    encoder = await encoderFactory({ locateFile: () => "/engines/remux/_private_split_encoder.wasm", print: options.print, printErr: options.printErr });
    if (encoder.HEAPU8.byteLength !== 16777216) throw new Error("Actual encoder heap mismatch");
    session = createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled });
    const originalBridge = options.withinBridge;
    const checkNativeWrite = bytes => {
      if (bytes.byteLength > 262144) throw new Error("Native media AVIO write exceeds unchanged256KiB cap");
      maximumMediaAvioWriteBytes = Math.max(maximumMediaAvioWriteBytes, bytes.byteLength);
    };
    const withinBridge = {...originalBridge, readSync: undefined,
      write(offset, bytes) { checkNativeWrite(bytes); return originalBridge.write(offset, bytes); },
      writeSync: originalBridge.writeSync ? (offset, bytes) => {
        checkNativeWrite(bytes); return originalBridge.writeSync(offset, bytes);
      } : undefined,
      progress(sample) {
      if (sample.wasmMemoryBytes !== 33554432 || encoder.HEAPU8.byteLength !== 16777216) throw new Error("Actual aggregate heap mismatch");
      originalBridge.progress({...sample, wasmMemoryBytes: sample.wasmMemoryBytes + encoder.HEAPU8.byteLength});
    }};
    core = await decoderFactory({...options, withinBridge, withinSplit: session,
      onAbort: createSplitAbortProbe({memoryBytes: () => core?.HEAPU8.byteLength ?? null, onAbort: options.onAbort}),
      locateFile: () => "/engines/remux/_private_split_decoder.wasm"});
    if (core.HEAPU8.byteLength !== 33554432) throw new Error("Actual decoder heap mismatch");
    const nativeStackBytes = core._emscripten_stack_get_base()-core._emscripten_stack_get_end();
    const encoderNativeStackBytes = encoder._emscripten_stack_get_base()-encoder._emscripten_stack_get_end();
    if (nativeStackBytes !== 262144 || encoderNativeStackBytes !== 262144) throw new Error("Actual native stack mismatch");
    console.debug("WITHIN_MPEG2_STACK_RESERVE "+JSON.stringify({nativeStackBytes,encoderNativeStackBytes,asyncifyStackBytes:262144,
      stackOverflowCheck:2,decoderMemoryBytes:core.HEAPU8.byteLength,encoderMemoryBytes:encoder.HEAPU8.byteLength,
      aggregateWasmMemoryBytes:core.HEAPU8.byteLength+encoder.HEAPU8.byteLength,scope:"reserved-not-high-water-not-acceptance"}));
    const call = core.ccall.bind(core);
    core.ccall = async (name,type,types,args,settings) => {
      let mapped = [...args];
      if (mapped[0] === 4) mapped = [6,...mapped.slice(1,4),0,0,0,...mapped.slice(4)];
      if (mapped[0] === 1 && mapped.length === 9)
        mapped = [6,...mapped.slice(1,4),0,0,0,...mapped.slice(4)];
      if (mapped[0] === 1) mapped[0] = 6;
      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }
      finally {
        try { session.close(); console.debug("WITHIN_MPEG2_SPLIT_FINAL "+JSON.stringify({...session.metrics(),maximumMediaAvioWriteBytes})); }
        finally { encoder = null; }
      }
    };
    return core;
  } catch(error) { if(session)session.close(); else if(encoder)encoder._within_split_encoder_close(); encoder=null; throw error; }
}
`;
const replacing = ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"];
const additional = new Map([
  ["split-abort-probe.mjs", path.join(root, "scripts/lib/split-abort-probe.mjs")],
  ["_private_split_decoder.mjs", path.join(source, "within-mpeg2-split.mjs")],
  ["_private_split_decoder.wasm", path.join(source, "within-mpeg2-split.wasm")],
  ["_private_split_encoder.mjs", path.join(source, "split-encoder.mjs")],
  ["_private_split_encoder.wasm", path.join(source, "split-encoder.wasm")],
  ...["mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"]
    .map(file => [file, path.join(root, "scripts/lib", file)]),
]);
if (process.argv[2] === "stage") {
  for (const file of replacing) assert.equal(await hash(path.join(target, file)), await hash(path.join(published, file)), "Unexpected generated asset");
  // Exclusive writes establish ownership before any replacement. Partial failure
  // restores published assets and removes only additions actually created here.
  const created = [];
  try {
    for (const [file, from] of additional) { await writeFile(path.join(target, file), await readFile(from), { flag: "wx" }); created.push(file); }
    for (const file of replacing) {
      if (file.endsWith(".mjs")) await writeFile(path.join(target, file), adapter);
      else await copyFile(path.join(source, "within-mpeg2-split.wasm"), path.join(target, file));
    }
  } catch (error) {
    for (const file of replacing) await copyFile(path.join(published, file), path.join(target, file));
    for (const file of created) await rm(path.join(target, file)); throw error;
  }
  process.stdout.write("Staged private32+16MiB split pipeline in generated assets; public assets unchanged.\n");
} else if (process.argv[2] === "restore") {
  for (const file of replacing) assert.equal(await hash(path.join(target, file)), file.endsWith(".mjs") ? sha(adapter) : manifest.artifacts["within-mpeg2-split.wasm"]);
  for (const [file, from] of additional) assert.equal(await hash(path.join(target, file)), await hash(from));
  for (const file of replacing) await copyFile(path.join(published, file), path.join(target, file));
  for (const file of additional.keys()) await rm(path.join(target, file));
  for (const file of replacing) assert.equal(await hash(path.join(target, file)), await hash(path.join(published, file)));
  process.stdout.write("Restored all six published asset hashes; nine private generated assets removed.\n");
} else throw new Error("Usage: stage-mpeg2-split-oom-diagnostic.mjs stage|restore with server stopped");
