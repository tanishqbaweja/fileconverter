import type { ConversionMetrics } from "../lib/conversion-protocol";

export function recordWasmMemory(
  metrics: ConversionMetrics,
  engine: string,
  bytes: number,
): void {
  const memories = metrics.wasmMemories ?? {};
  memories[engine] = bytes;
  metrics.wasmMemories = memories;

  const total = Object.values(memories).reduce(
    (sum, memoryBytes) => sum + memoryBytes,
    0,
  );
  metrics.wasmMemoryBytes = total;
  metrics.peakWasmMemoryBytes = Math.max(
    metrics.peakWasmMemoryBytes ?? 0,
    total,
  );
}
