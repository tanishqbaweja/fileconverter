// One immutable STATIC engine module, never an instance, memory, File or output.
// This private candidate is not a public route or a memory-acceptance shortcut.
export const VPX_STATIC_WASM_URL = "/engines/vpx/within-remux.wasm";
export const VPX_STATIC_WASM_MAXIMUM_BYTES = 16 * 1024 * 1024;
export interface VpxCompiledCore { module: WebAssembly.Module; sha256: string; byteLength: number }

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

export async function prepareVpxCompiledCore(cached?: VpxCompiledCore, fetchStatic: typeof fetch = fetch,
  compile: typeof WebAssembly.compile = WebAssembly.compile): Promise<{ core: VpxCompiledCore; cacheHit: boolean }> {
  if (cached) cached = validateVpxCompiledCore(cached);
  const response = await fetchStatic(VPX_STATIC_WASM_URL, { credentials: "same-origin", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Private static VPX engine is unavailable");
  }
  const length = response.headers.get("content-length"), declared = length === null ? null : Number(length);
  if (declared !== null && (!Number.isSafeInteger(declared) || declared < 8 || declared > VPX_STATIC_WASM_MAXIMUM_BYTES)) {
    await response.body.cancel().catch(() => {});
    throw new Error("Static VPX engine length exceeds its bound");
  }
  // Static website-delivered CODE only, not a user file. One bounded allocation;
  // do not collect chunks. Rehash on every job so a changed asset cannot reuse
  // stale code even if its unversioned private URL remains the same.
  const buffer = new Uint8Array(declared ?? VPX_STATIC_WASM_MAXIMUM_BYTES), reader = response.body.getReader();
  let at = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if (value.byteLength > buffer.byteLength - at) throw new Error("Static VPX engine exceeded its declared bound");
      buffer.set(value, at); at += value.byteLength;
    }
    if (at < 8 || (declared !== null && at !== declared)) throw new Error("Static VPX engine length changed");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = buffer.subarray(0, at);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (cached?.sha256 === sha256 && cached.byteLength === at) return { core: cached, cacheHit: true };
  const compiledModule = await compile(bytes);
  return { core: validateVpxCompiledCore({ module: compiledModule, sha256, byteLength: at }), cacheHit: false };
}
