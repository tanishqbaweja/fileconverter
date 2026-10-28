import type { ConversionMetrics } from "./conversion-protocol";

type Phase = NonNullable<ConversionMetrics["svgMemoryObservation"]>["phase"];
const phases = Object.freeze({ preparing: true, initialized: true, parsed: true, rasterized: true, encoded: true, released: true });
/** Scalar observations of the real linear buffer, not OS private bytes or copies. */
export function observeSvgMemory(metrics: ConversionMetrics, phase: Phase, memory: WebAssembly.Memory | null): void {
  if (!Object.hasOwn(phases, phase)) throw new TypeError("Unknown SVG memory observation phase");
  let bytes: number | null = null;
  try {
    const value = memory?.buffer.byteLength;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value % 65536 === 0) bytes = value;
  } catch { /* Missing export/read remains unavailable, never a zero sample. */ }
  const previous = metrics.svgMemoryObservation;
  const peak = bytes === null ? previous?.peakBytes ?? null : Math.max(previous?.peakBytes ?? 0, bytes);
  metrics.svgMemoryObservation = {
    phase, currentBytes: bytes, peakBytes: peak,
    currentPages: bytes === null ? null : bytes / 65536, peakPages: peak === null ? null : peak / 65536,
    maximumBytes: null, maximumPages: null, phaseBytes: { ...previous?.phaseBytes, [phase]: bytes },
    maximumStatus: "not-observed-from-runtime-binding", available: bytes !== null,
    observations: (previous?.observations ?? 0) + 1,
    unavailableObservations: (previous?.unavailableObservations ?? 0) + (bytes === null && phase !== "preparing" ? 1 : 0),
  };
  metrics.wasmMemories ??= {};
  if (bytes === null) { delete metrics.wasmMemoryBytes; delete metrics.wasmMemories.resvg; }
  else { metrics.wasmMemoryBytes = bytes; metrics.wasmMemories.resvg = bytes; }
  if (peak === null) delete metrics.peakWasmMemoryBytes;
  else metrics.peakWasmMemoryBytes = peak;
}
