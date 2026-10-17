// PRIVATE candidate: two immutable compiled modules, never a File, instance,
// memory, packet, decoded frame or output buffer. Physical code bytes are not
// exposed by this API: the complete Chromium private-memory metric still counts.
export const COMPILED_CODEC_BINDING = "e15ab14e6f6961c99591e2e84635d0d90f000aa5042cd134fd9812142ade4f7e:a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee";
type Modules = { decoder: WebAssembly.Module; encoder: WebAssembly.Module };
type CacheMessage = Modules & { type: "compiled-codec-modules" | "prime-compiled-codec-modules"; binding: string };
type CacheEvent = { event: "compiled" | "reused" | "retained" | "primed"; role?: keyof Modules; modules: number; physicalCodeBytes: null };
const emitDefault = (row: CacheEvent) => console.debug("WITHIN_COMPILED_CODE_CACHE " + JSON.stringify(row));
function readModules(value: unknown, type: CacheMessage["type"]): Modules {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid compiled-code cache descriptor");
  const keys = Reflect.ownKeys(value), row = value as Partial<CacheMessage>;
  if (keys.length !== 4 || keys.some(key => !["type", "binding", "decoder", "encoder"].includes(String(key))) ||
    row.type !== type || row.binding !== COMPILED_CODEC_BINDING ||
    !(row.decoder instanceof WebAssembly.Module) || !(row.encoder instanceof WebAssembly.Module)) {
    throw new Error("Only the pinned compiled decoder/encoder module pair may be cached");
  }
  return { decoder: row.decoder, encoder: row.encoder };
}
export function createCompiledCodecHostCache(emit: (row: CacheEvent) => void = emitDefault) {
  let modules: Modules | null = null;
  return {
    metrics: () => ({ modules: modules ? 2 : 0, maximumModules: 2, physicalCodeBytes: null,
      cachedInstances: 0, cachedMemories: 0, cachedFiles: 0, cachedUserBuffers: 0 }),
    bind(worker: Worker): Worker {
      let callback: Worker["onmessage"] = null, terminated = false;
      const terminate = worker.terminate.bind(worker);
      const receive = (event: MessageEvent) => {
        if (terminated) return;
        try {
          if (event.data?.type === "compiled-codec-modules") {
            modules = readModules(event.data, "compiled-codec-modules");
            emit({ event: "retained", modules: 2, physicalCodeBytes: null }); return;
          }
          if (event.data?.type === "ready" && modules) {
            // Same message port: prime precedes the coordinator's queued start.
            worker.postMessage({ type: "prime-compiled-codec-modules", binding: COMPILED_CODEC_BINDING, ...modules });
          }
          callback?.call(worker, event);
        } catch (error) {
          worker.dispatchEvent(new ErrorEvent("error", { message: error instanceof Error ? error.message : "Compiled-code cache rejected", cancelable: true }));
        }
      };
      Object.defineProperty(worker, "onmessage", { configurable: true, get: () => callback,
        set: (value: Worker["onmessage"]) => { callback = value; } });
      worker.addEventListener("message", receive);
      worker.terminate = () => {
        if (terminated) return;
        terminated = true; callback = null; worker.removeEventListener("message", receive); terminate();
      };
      return worker;
    },
  };
}
const pageCache = createCompiledCodecHostCache();
export const bindCompiledCodecCache = (worker: Worker): Worker => pageCache.bind(worker);

interface CodecCacheWorkerScope {
  location: { origin: string };
  addEventListener(type: "message", callback: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", callback: (event: MessageEvent) => void): void;
  postMessage(value: CacheMessage): void;
}
export function installCompiledCodecCache(scope: CodecCacheWorkerScope, emit: (row: CacheEvent) => void = emitDefault) {
  const original = WebAssembly.instantiateStreaming;
  const modules: Partial<Modules> = {};
  let sentPair = false, observations = 0, streamingStarted = false;
  const observe = (row: CacheEvent) => { if (observations++ < 8) emit(row); };
  const prime = (event: MessageEvent) => {
    if (event.data?.type !== "prime-compiled-codec-modules") return;
    event.stopImmediatePropagation();
    if (streamingStarted || sentPair) throw new Error("Compiled-code priming must precede conversion");
    const received = readModules(event.data, "prime-compiled-codec-modules");
    modules.decoder = received.decoder; modules.encoder = received.encoder; sentPair = true;
    observe({ event: "primed", modules: 2, physicalCodeBytes: null });
  };
  scope.addEventListener("message", prime);
  const streaming: typeof WebAssembly.instantiateStreaming = async (...args) => {
    const response = await args[0];
    const role: keyof Modules | null = response.url === scope.location.origin + "/engines/remux/_private_split_decoder.wasm" ? "decoder"
      : response.url === scope.location.origin + "/engines/remux/_private_split_encoder.wasm" ? "encoder" : null;
    if (!role || args.length > 2) return original(...args);
    streamingStarted = true;
    const cached = modules[role];
    // The factory already requested this static engine asset. Reuse compiled
    // code without leaving an unread network response/body alive until GC.
    if (cached) await response.body?.cancel();
    const result = cached ? { module: cached, instance: await WebAssembly.instantiate(cached, args[1]) } : await original(...args);
    modules[role] = result.module;
    observe({ event: cached ? "reused" : "compiled", role, modules: Number(Boolean(modules.decoder)) + Number(Boolean(modules.encoder)), physicalCodeBytes: null });
    if (!sentPair && modules.decoder && modules.encoder) {
      scope.postMessage({ type: "compiled-codec-modules", binding: COMPILED_CODEC_BINDING, decoder: modules.decoder, encoder: modules.encoder });
      sentPair = true;
    }
    return result;
  };
  WebAssembly.instantiateStreaming = streaming;
  return { restore() {
    scope.removeEventListener("message", prime);
    if (WebAssembly.instantiateStreaming === streaming) WebAssembly.instantiateStreaming = original;
  } };
}
