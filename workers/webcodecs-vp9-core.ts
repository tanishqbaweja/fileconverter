// Private qualification injection only. Public jobs do not load this module.
import type { AudioConversionOptions, VideoConversionOptions } from "../lib/media-conversion-options";
import type { RemuxFactoryOptions, RemuxModule } from "./media-remux";
import { createWebCodecsVp9Bridge } from "./webcodecs-vp9-bridge.mjs";

type EncoderBridge = ReturnType<typeof createWebCodecsVp9Bridge>;
export interface WebCodecsVp9Core {
  abi: "general-12";
  wasmUrl: "/engines/webcodecs-vp9/within-webcodecs-vp9.wasm";
  factory: (options: RemuxFactoryOptions) => Promise<RemuxModule>;
  snapshot: () => ReturnType<EncoderBridge["snapshot"]> | null;
}
type NativeFactory = (options: RemuxFactoryOptions & { withinWebCodecs: EncoderBridge }) => Promise<RemuxModule & { HEAPU8: Uint8Array }>;
type Importer = (url: string) => Promise<{ default: unknown }>;

export function assertWebCodecsVp9Options(profile: number, audio?: AudioConversionOptions, video?: VideoConversionOptions): void {
  const bounded = (value: number | undefined, minimum: number, maximum: number, even = false) => value === undefined || value === 0 ||
    (Number.isInteger(value) && value >= minimum && value <= maximum && (!even || value % 2 === 0));
  if ((profile !== 10 && profile !== 11) || (video?.codec && video.codec !== "automatic" && video.codec !== "vp9") ||
      (video?.quality && video.quality !== "automatic") || !bounded(video?.maxWidth, 2, 1920, true) ||
      !bounded(video?.frameRateFps, 1, 120) || !bounded(video?.bitRateBps, 10000, 20000000) ||
      Object.entries(audio ?? {}).some(([key, value]) => ["codec", "compression", "quality"].includes(key) ?
        value !== undefined && value !== "automatic" : !["bitRateBps", "sampleRateHz", "channels"].includes(key) || Boolean(value)))
    throw new DOMException("This private VP9 encoder does not implement those controls; retain the existing Wasm path.", "NotSupportedError");
}
export async function loadWebCodecsVp9Core(importer: Importer = url => import(/* @vite-ignore */ url)): Promise<WebCodecsVp9Core> {
  const jspi = WebAssembly as typeof WebAssembly & { Suspending?: unknown; promising?: unknown };
  if (typeof jspi.Suspending !== "function" || typeof jspi.promising !== "function")
    throw new DOMException("Stable JSPI is unavailable; retain the existing Wasm path.", "NotSupportedError");
  const imported = await importer("/engines/webcodecs-vp9/within-webcodecs-vp9.mjs");
  if (typeof imported.default !== "function") throw new TypeError("Private VP9 native factory is absent.");
  const nativeFactory = imported.default as NativeFactory;
  let last: ReturnType<EncoderBridge["snapshot"]> | null = null, active = false;
  return { abi: "general-12", wasmUrl: "/engines/webcodecs-vp9/within-webcodecs-vp9.wasm", snapshot: () => last,
    async factory(options) {
      if (active) throw new Error("The private VP9 core cannot be reused concurrently."); active = true;
      const bridge = createWebCodecsVp9Bridge({ isCancelled: options.withinBridge.cancelled });
      let native: Awaited<ReturnType<NativeFactory>> | undefined, disposed = false;
      const dispose = () => {
        if (disposed) return; disposed = true;
        try { native?.dispose?.(); } finally { bridge.close(); last = bridge.snapshot(); native = undefined; active = false; }
      };
      try {
        native = await nativeFactory({ ...options, withinWebCodecs: bridge });
        if (native.HEAPU8.byteLength !== 33554432 || native.HEAPU8.buffer instanceof SharedArrayBuffer)
          throw new Error("Private VP9 requires its fixed32MiB nonshared native heap.");
        return { ccall: (...args) => {
          if (!native || disposed) return Promise.reject(new Error("Private VP9 core is disposed."));
          return native.ccall(...args);
        }, dispose };
      } catch (error) { dispose(); throw error; }
    },
  };
}
