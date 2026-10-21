import type { RemuxFactoryOptions, RemuxModule } from "./media-remux";
import type { VpxSourceCodec } from "../lib/vpx-decoder-policy";
export interface VpxDecoderCore {
  sourceCodec: VpxSourceCodec;
  abi: "general-12";
  factory: (options: RemuxFactoryOptions) => Promise<RemuxModule>;
  wasmUrl: "/engines/vpx/within-remux.wasm";
}
type NativeImport = (url: string) => Promise<{ default: unknown }>;
const importNative: NativeImport = url => import(/* @vite-ignore */ url);
/** Private assets, never fallback to a public core without these CPU decoders. */
export async function loadVpxDecoderCore(sourceCodec: VpxSourceCodec, importer: NativeImport = importNative): Promise<VpxDecoderCore> {
  if (sourceCodec !== "VP8" && sourceCodec !== "VP9") throw new TypeError("VPX source codec is invalid.");
  let imported: { default: unknown };
  try { imported = await importer("/engines/vpx/within-remux.mjs"); }
  catch (cause) { throw new Error("The unpublished VP8/VP9 CPU decoder engine is not installed in this build.", { cause }); }
  if (typeof imported.default !== "function") throw new Error("The VPX engine did not export its native factory.");
  return { sourceCodec, abi: "general-12", factory: imported.default as VpxDecoderCore["factory"], wasmUrl: "/engines/vpx/within-remux.wasm" };
}
