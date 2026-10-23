import type { Mpeg2SplitCore } from "./mpeg2-split-runtime";
import { prepareMpeg2CompiledCore, type Mpeg2CompiledCore } from "../lib/mpeg2-compiled-core";

type NativeImport = (url: string) => Promise<{ default: unknown }>;
const importNative: NativeImport = url => import(/* @vite-ignore */ url);

/** Only the explicit MPEG-2 job calls this; no public route is implied. */
export async function loadMpeg2SplitCore(importer: NativeImport = importNative, compilation?: {
  cached?: Mpeg2CompiledCore;
  prepared(core: Mpeg2CompiledCore, cacheHit: boolean, compiledRoles: string[]): void;
  fetchStatic?: typeof fetch;
}): Promise<Mpeg2SplitCore> {
  const wasm = WebAssembly as typeof WebAssembly & { Suspending?: unknown; promising?: unknown };
  if (typeof wasm.Suspending !== "function" || typeof wasm.promising !== "function") {
    throw new Error("MPEG-2 requires stable WebAssembly JSPI; no full-memory fallback is available.");
  }
  let decoder: { default: unknown }, encoder: { default: unknown };
  try {
    [decoder, encoder] = await Promise.all([
      importer("/engines/mpeg2/decoder.mjs"), importer("/engines/mpeg2/encoder.mjs"),
    ]);
  } catch (cause) {
    throw new Error("The unpublished MPEG-2 engine is not installed in this build.", { cause });
  }
  if (typeof decoder.default !== "function" || typeof encoder.default !== "function") {
    throw new Error("The MPEG-2 engine modules did not export their native factories.");
  }
  const nativeDecoder = decoder.default as Mpeg2SplitCore["decoderFactory"], nativeEncoder = encoder.default as Mpeg2SplitCore["encoderFactory"];
  let prepared: Promise<Mpeg2CompiledCore> | undefined;
  const getPrepared = () => prepared ??= prepareMpeg2CompiledCore(compilation?.cached, compilation?.fetchStatic).then(value => {
    compilation!.prepared(value.core, value.cacheHit, value.compiledRoles); return value.core;
  });
  // The two factories share only preparation of immutable code. Each receives
  // fresh Emscripten imports/memory and constructs its own Wasm instance.
  return {
    decoderFactory: compilation ? async options => {
      const core = await getPrepared();
      return nativeDecoder({ ...options, instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(core.decoder, imports); receive(instance, core.decoder); return instance.exports;
      } });
    } : nativeDecoder,
    encoderFactory: compilation ? async options => {
      const core = await getPrepared();
      return nativeEncoder({ ...options, instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(core.encoder, imports); receive(instance, core.encoder); return instance.exports;
      } });
    } : nativeEncoder,
    decoderWasmUrl: "/engines/mpeg2/decoder.wasm", encoderWasmUrl: "/engines/mpeg2/encoder.wasm",
  };
}
