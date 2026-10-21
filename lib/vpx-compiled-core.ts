// One immutable STATIC engine module, never an instance, memory, File or output.
// This private candidate is not a public route or a memory-acceptance shortcut.
export const VPX_STATIC_WASM_URL = "/engines/vpx/within-remux.wasm";
export const VPX_STATIC_MANIFEST_URL = "/engines/vpx/build-manifest.json";
export const VPX_STATIC_WASM_MAXIMUM_BYTES = 16 * 1024 * 1024;
export interface VpxCompiledCore { module: WebAssembly.Module; sha256: string; byteLength: number }
export interface VpxCompiledCoreSlot {
  get(): VpxCompiledCore | null;
  set(value: VpxCompiledCore): void;
  clear(): void;
  dispose(): void;
}
export function createVpxCompiledCoreSlot(): VpxCompiledCoreSlot {
  let core: VpxCompiledCore | null = null, disposed = false;
  return {
    get: () => core,
    set(value) { if (disposed) throw new Error("Static code owner is disposed"); core = validateVpxCompiledCore(value); },
    clear() { core = null; },
    dispose() { core = null; disposed = true; },
  };
}

export function validateVpxCompiledCore(value: unknown): VpxCompiledCore {
  if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "byteLength,module,sha256")
    throw new TypeError("Invalid static VPX code descriptor");
  const core = value as VpxCompiledCore;
  if (!(core.module instanceof WebAssembly.Module) || Reflect.ownKeys(core.module).length !== 0 ||
      typeof core.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(core.sha256) ||
      !Number.isSafeInteger(core.byteLength) || core.byteLength < 8 || core.byteLength > VPX_STATIC_WASM_MAXIMUM_BYTES)
    throw new TypeError("Invalid static VPX code descriptor");
  return Object.freeze({ module: core.module, sha256: core.sha256, byteLength: core.byteLength });
}

async function readStaticBytes(url: string, maximum: number, fetchStatic: typeof fetch): Promise<Uint8Array<ArrayBuffer>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  try {
    const response = await fetchStatic(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {}); throw new Error("Private static VPX asset is unavailable");
    }
    const encoding = response.headers.get("content-encoding");
    const length = response.headers.get("content-length"), declared = length === null || (encoding && encoding !== "identity") ? null : Number(length);
    if (declared !== null && (!Number.isSafeInteger(declared) || declared < 2 || declared > maximum)) {
      await response.body.cancel().catch(() => {}); throw new Error("Static VPX asset length exceeds its bound");
    }
    // Static CODE/manifest only, never a user file. One bounded allocation, no
    // chunk collection. The large code body is fetched only on an actual miss.
    const buffer = new Uint8Array(declared ?? maximum); reader = response.body.getReader(); let at = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if (value.byteLength > buffer.byteLength - at) throw new Error("Static VPX engine exceeded its declared bound");
      buffer.set(value, at); at += value.byteLength;
    }
    if (at < 2 || (declared !== null && at !== declared)) throw new Error("Static VPX asset length changed");
    return buffer.subarray(0, at);
  } finally {
    try { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
    finally { clearTimeout(timer); controller.abort(); }
  }
}

export async function prepareVpxCompiledCore(cached?: VpxCompiledCore, fetchStatic: typeof fetch = fetch,
  compile: typeof WebAssembly.compile = WebAssembly.compile): Promise<{ core: VpxCompiledCore; cacheHit: boolean }> {
  if (cached) cached = validateVpxCompiledCore(cached);
  const manifestBytes = await readStaticBytes(VPX_STATIC_MANIFEST_URL, 65536, fetchStatic);
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  const expected = manifest?.artifacts?.["within-remux.wasm"];
  if (manifest?.engine !== "within-remux-private-vpx-timeline" || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error("Private VPX static manifest is invalid");
  // A verified module belongs to the manifest's release. Retain that safe code
  // rather than refetching multi-megabyte bytes on every job. On a manifest hash
  // change, fetch and verify the new body before replacing the one-entry cache.
  if (cached?.sha256 === expected) return { core: cached, cacheHit: true };
  const bytes = await readStaticBytes(VPX_STATIC_WASM_URL, VPX_STATIC_WASM_MAXIMUM_BYTES, fetchStatic);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (sha256 !== expected) throw new Error("Private VPX code does not match its static manifest");
  const compiledModule = await compile(bytes);
  return { core: validateVpxCompiledCore({ module: compiledModule, sha256, byteLength: bytes.byteLength }), cacheHit: false };
}
