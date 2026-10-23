// Immutable static CODE only. No instance, memory, file, packets or output.
export interface Mpeg2CompiledCore {
  decoder: WebAssembly.Module;
  encoder: WebAssembly.Module;
  binding: string;
  decoderBytes: number;
  encoderBytes: number;
}
export interface Mpeg2CompiledCoreSlot {
  get(): Mpeg2CompiledCore | null;
  set(core: Mpeg2CompiledCore): void;
  clear(): void;
  dispose(): void;
}
export function validateMpeg2CompiledCore(value: unknown): Mpeg2CompiledCore {
  if (!value || typeof value !== "object" || Reflect.ownKeys(value).map(String).sort().join(",") !== "binding,decoder,decoderBytes,encoder,encoderBytes")
    throw new TypeError("Invalid static MPEG-2 code descriptor");
  const core = value as Mpeg2CompiledCore;
  if (![core.decoder, core.encoder].every(module => module instanceof WebAssembly.Module && Reflect.ownKeys(module).length === 0) ||
      typeof core.binding !== "string" || !/^[a-f0-9]{64}:[a-f0-9]{64}$/.test(core.binding) ||
      ![core.decoderBytes, core.encoderBytes].every(bytes => Number.isSafeInteger(bytes) && bytes >= 8 && bytes <= 16 * 1024 * 1024))
    throw new TypeError("Invalid static MPEG-2 code descriptor");
  return Object.freeze({ decoder: core.decoder, encoder: core.encoder, binding: core.binding, decoderBytes: core.decoderBytes, encoderBytes: core.encoderBytes });
}
export function createMpeg2CompiledCoreSlot(): Mpeg2CompiledCoreSlot {
  let core: Mpeg2CompiledCore | null = null, disposed = false;
  return { get: () => core, set(value) { if (disposed) throw new Error("Static MPEG-2 owner is disposed"); core = validateMpeg2CompiledCore(value); },
    clear() { core = null; }, dispose() { core = null; disposed = true; } };
}
async function staticBytes(url: string, maximum: number, fetchStatic: typeof fetch): Promise<Uint8Array<ArrayBuffer>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  try {
    const response = await fetchStatic(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error("Private static MPEG-2 asset is unavailable"); }
    const encoding = response.headers.get("content-encoding"), length = response.headers.get("content-length");
    const declared = length === null || (encoding && encoding !== "identity") ? null : Number(length);
    if (declared !== null && (!Number.isSafeInteger(declared) || declared < 2 || declared > maximum)) {
      await response.body.cancel().catch(() => {}); throw new Error("Static MPEG-2 asset length exceeds its bound");
    }
    const bytes = new Uint8Array(declared ?? maximum); reader = response.body.getReader(); let at = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      if (value.byteLength > bytes.byteLength - at) throw new Error("Static MPEG-2 asset exceeded its declared bound");
      bytes.set(value, at); at += value.byteLength;
    }
    if (at < 2 || (declared !== null && at !== declared)) throw new Error("Static MPEG-2 asset length changed");
    return bytes.subarray(0, at);
  } finally { try { await reader?.cancel().catch(() => {}); reader?.releaseLock(); } finally { clearTimeout(timer); controller.abort(); } }
}
export async function prepareMpeg2CompiledCore(cached?: Mpeg2CompiledCore, fetchStatic: typeof fetch = fetch,
  compile: typeof WebAssembly.compile = WebAssembly.compile): Promise<{ core: Mpeg2CompiledCore; cacheHit: boolean; compiledRoles: string[] }> {
  const wasm = WebAssembly as unknown as { Suspending?: unknown; promising?: unknown };
  if (typeof wasm.Suspending !== "function" || typeof wasm.promising !== "function") throw new Error("MPEG-2 requires stable WebAssembly JSPI support");
  if (cached) cached = validateMpeg2CompiledCore(cached);
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await staticBytes("/engines/mpeg2/build-manifest.json", 65536, fetchStatic)));
  const decoderHash = manifest?.artifacts?.["decoder.wasm"], encoderHash = manifest?.artifacts?.["encoder.wasm"];
  if (manifest?.schemaVersion !== 1 || manifest.engine !== "within-mpeg2-split-jspi" ||
      manifest.decoderMemoryBytes !== 33554432 || manifest.encoderMemoryBytes !== 16777216 ||
      typeof decoderHash !== "string" || !/^[a-f0-9]{64}$/.test(decoderHash) || typeof encoderHash !== "string" || !/^[a-f0-9]{64}$/.test(encoderHash))
    throw new Error("Private static MPEG-2 manifest is invalid");
  const old = cached?.binding.split(":"), compiledRoles: string[] = [];
  const role = async (name: "decoder" | "encoder", hash: string, index: number) => {
    if (cached && old?.[index] === hash) return { module: cached[name], bytes: cached[name === "decoder" ? "decoderBytes" : "encoderBytes"] };
    const bytes = await staticBytes(`/engines/mpeg2/${name}.wasm`, 16 * 1024 * 1024, fetchStatic);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== hash) throw new Error("Private MPEG-2 code does not match its static manifest");
    const compiled = await compile(bytes); compiledRoles.push(name); return { module: compiled, bytes: bytes.length };
  };
  // Serial code preparation keeps only one static byte body in flight.
  const decoder = await role("decoder", decoderHash, 0), encoder = await role("encoder", encoderHash, 1);
  return { core: validateMpeg2CompiledCore({ decoder: decoder.module, encoder: encoder.module, binding: decoderHash + ":" + encoderHash,
    decoderBytes: decoder.bytes, encoderBytes: encoder.bytes }), cacheHit: compiledRoles.length === 0, compiledRoles };
}
