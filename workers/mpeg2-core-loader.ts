import type { Mpeg2SplitCore } from "./mpeg2-split-runtime";

type NativeImport = (url: string) => Promise<{ default: unknown }>;
const importNative: NativeImport = url => import(/* @vite-ignore */ url);

/** Only the explicit MPEG-2 job calls this; no public route is implied. */
export async function loadMpeg2SplitCore(importer: NativeImport = importNative): Promise<Mpeg2SplitCore> {
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
  return {
    decoderFactory: decoder.default as Mpeg2SplitCore["decoderFactory"],
    encoderFactory: encoder.default as Mpeg2SplitCore["encoderFactory"],
    decoderWasmUrl: "/engines/mpeg2/decoder.wasm", encoderWasmUrl: "/engines/mpeg2/encoder.wasm",
  };
}
