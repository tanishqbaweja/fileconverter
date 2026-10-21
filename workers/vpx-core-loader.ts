import type { RemuxFactoryOptions, RemuxModule } from "./media-remux";
import type { VpxSourceCodec } from "../lib/vpx-decoder-policy";
import { prepareVpxCompiledCore, type VpxCompiledCore } from "../lib/vpx-compiled-core";
export interface VpxDecoderCore {
  sourceCodec: VpxSourceCodec;
  abi: "general-12";
  factory: (options: RemuxFactoryOptions) => Promise<RemuxModule>;
  wasmUrl: "/engines/vpx/within-remux.wasm";
}
type NativeImport = (url: string) => Promise<{ default: unknown }>;
const importNative: NativeImport = url => import(/* @vite-ignore */ url);
/** Private assets, never fallback to a public core without these CPU decoders. */
export async function loadVpxDecoderCore(sourceCodec: VpxSourceCodec, importer: NativeImport = importNative, compilation?: {
  cached?: VpxCompiledCore;
  prepared(core: VpxCompiledCore, cacheHit: boolean): void;
  fetchStatic?: typeof fetch;
}): Promise<VpxDecoderCore> {
  if (sourceCodec !== "VP8" && sourceCodec !== "VP9") throw new TypeError("VPX source codec is invalid.");
  let imported: { default: unknown };
  try { imported = await importer("/engines/vpx/within-remux.mjs"); }
  catch (cause) { throw new Error("The unpublished VP8/VP9 CPU decoder engine is not installed in this build.", { cause }); }
  if (typeof imported.default !== "function") throw new Error("The VPX engine did not export its native factory.");
  const nativeFactory = imported.default as VpxDecoderCore["factory"];
  const factory: VpxDecoderCore["factory"] = compilation ? async options => {
    const { core, cacheHit } = await prepareVpxCompiledCore(compilation.cached, compilation.fetchStatic);
    compilation.prepared(core, cacheHit);
    return nativeFactory({ ...options, instantiateWasm(imports, receive) {
      // The module shares static compiled code, NOT the imported memory or any
      // instance state. Emscripten creates fresh bounded imports for this worker.
      const instance = new WebAssembly.Instance(core.module, imports);
      receive(instance, core.module); return instance.exports;
    } });
  } : nativeFactory;
  return { sourceCodec, abi: "general-12", factory, wasmUrl: "/engines/vpx/within-remux.wasm" };
}
