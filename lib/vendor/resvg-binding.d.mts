export { initWasm, Resvg } from "@resvg/resvg-wasm";
export declare function getInitializedResvgMemory(): WebAssembly.Memory | null;
export declare function getLastResvgFailureProbe(): { site: number; value: number } | null;
