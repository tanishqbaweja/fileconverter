import {
  JXL_INSPECTOR_WASM_MEMORY_BYTES,
  MAX_JXL_INSPECTION_BYTES,
  type JxlHeaderInspection,
} from "../lib/jxl-source-inspection";
import { MAX_WORKER_RESPONSE_TEXT_CHARS } from "../lib/resource-limits";

const MODULE_URL = "/engines/jxl-inspector/within-jxl-inspector.mjs";
const WASM_URL = "/engines/jxl-inspector/within-jxl-inspector.wasm";
const MAX_READ_BYTES = 64 * 1024;

interface InspectorBridge {
  read(offset: number, destination: Uint8Array): Promise<number>;
  message(message: string): void;
}

interface InspectorModule {
  HEAPU8: Uint8Array;
  ccall(
    name: "within_jxl_inspect",
    returnType: "number",
    argumentTypes: ["number"],
    arguments_: [number],
    options: { async: true },
  ): Promise<number>;
  UTF8ToString(pointer: number, maximumBytes?: number): string;
  _within_jxl_inspector_error(): number;
  _within_jxl_inspector_width(): number;
  _within_jxl_inspector_height(): number;
  _within_jxl_inspector_intrinsic_width(): number;
  _within_jxl_inspector_intrinsic_height(): number;
  _within_jxl_inspector_bits(): number;
  _within_jxl_inspector_color_channels(): number;
  _within_jxl_inspector_alpha_bits(): number;
  _within_jxl_inspector_orientation(): number;
  _within_jxl_inspector_has_animation(): number;
  _within_jxl_inspector_tps_numerator(): number;
  _within_jxl_inspector_tps_denominator(): number;
  _within_jxl_inspector_num_loops(): number;
  _within_jxl_inspector_have_timecodes(): number;
  _within_jxl_inspector_frame_count(): number;
  _within_jxl_inspector_frame_count_exact(): number;
  _within_jxl_inspector_total_duration_ticks(): number;
  _within_jxl_inspector_named_frame_count(): number;
  _within_jxl_inspector_inspected_bytes(): number;
  _within_jxl_inspector_peak_allocation(): number;
}

type InspectorModuleFactory = (options: {
  withinBridge: InspectorBridge;
  locateFile(name: string): string;
  print(message: string): void;
  printErr(message: string): void;
}) => Promise<InspectorModule>;

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<{ file: File }>) => {
  void inspect(event.data.file);
};

async function inspect(file: File): Promise<void> {
  const errors: string[] = [];
  let maximumReadBytes = 0;
  try {
    const imported = (await import(/* @vite-ignore */ MODULE_URL)) as {
      default: InspectorModuleFactory;
    };
    const bridge: InspectorBridge = {
      async read(offset, destination) {
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          destination.byteLength < 1 ||
          destination.byteLength > MAX_READ_BYTES ||
          offset + destination.byteLength > MAX_JXL_INSPECTION_BYTES
        ) {
          throw new Error("JPEG XL inspector requested an invalid bounded read.");
        }
        const bytes = new Uint8Array(
          await file
            .slice(offset, Math.min(file.size, offset + destination.byteLength))
            .arrayBuffer(),
        );
        destination.set(bytes);
        maximumReadBytes = Math.max(maximumReadBytes, bytes.byteLength);
        return bytes.byteLength;
      },
      message(message) {
        if (errors.length < 4) errors.push(message.slice(0, 512));
      },
    };
    const inspectorModule = await imported.default({
      withinBridge: bridge,
      locateFile: (name) => (name.endsWith(".wasm") ? WASM_URL : name),
      print: () => {},
      printErr: (message) => bridge.message(message),
    });
    const wasmMemoryBytes = inspectorModule.HEAPU8.buffer.byteLength;
    if (wasmMemoryBytes !== JXL_INSPECTOR_WASM_MEMORY_BYTES) {
      throw new Error(
        `JPEG XL inspector loaded ${wasmMemoryBytes.toLocaleString("en-US")} bytes of Wasm memory; expected ${JXL_INSPECTOR_WASM_MEMORY_BYTES.toLocaleString("en-US")}.`,
      );
    }
    const result = await inspectorModule.ccall(
      "within_jxl_inspect",
      "number",
      ["number"],
      [file.size],
      { async: true },
    );
    if (result !== 0) {
      const nativeError = inspectorModule.UTF8ToString(
        inspectorModule._within_jxl_inspector_error(),
        512,
      );
      throw new Error(
        [nativeError, ...errors].filter(Boolean).join(" | ") ||
          `JPEG XL inspection failed with code ${result}.`,
      );
    }
    const inspection: JxlHeaderInspection = {
      width: inspectorModule._within_jxl_inspector_width(),
      height: inspectorModule._within_jxl_inspector_height(),
      intrinsicWidth: inspectorModule._within_jxl_inspector_intrinsic_width(),
      intrinsicHeight: inspectorModule._within_jxl_inspector_intrinsic_height(),
      bitDepth: inspectorModule._within_jxl_inspector_bits(),
      colorChannels: inspectorModule._within_jxl_inspector_color_channels(),
      alphaBits: inspectorModule._within_jxl_inspector_alpha_bits(),
      orientation: inspectorModule._within_jxl_inspector_orientation(),
      hasAnimation: inspectorModule._within_jxl_inspector_has_animation() !== 0,
      ticksPerSecondNumerator: inspectorModule._within_jxl_inspector_tps_numerator(),
      ticksPerSecondDenominator: inspectorModule._within_jxl_inspector_tps_denominator(),
      loopCount: inspectorModule._within_jxl_inspector_num_loops(),
      hasTimecodes: inspectorModule._within_jxl_inspector_have_timecodes() !== 0,
      frameCount: inspectorModule._within_jxl_inspector_frame_count(),
      frameCountExact:
        inspectorModule._within_jxl_inspector_frame_count_exact() !== 0,
      totalDurationTicks:
        inspectorModule._within_jxl_inspector_total_duration_ticks(),
      namedFrameCount: inspectorModule._within_jxl_inspector_named_frame_count(),
      inspectedBytes: inspectorModule._within_jxl_inspector_inspected_bytes(),
      peakDecoderAllocationBytes: inspectorModule._within_jxl_inspector_peak_allocation(),
      wasmMemoryBytes,
      maximumReadBytes,
    };
    if (
      inspection.width < 1 ||
      inspection.height < 1 ||
      inspection.bitDepth < 1 ||
      inspection.colorChannels < 1 ||
      inspection.frameCount > 1_000 ||
      inspection.namedFrameCount > inspection.frameCount ||
      inspection.orientation < 1 ||
      inspection.orientation > 8 ||
      inspection.inspectedBytes < 1 ||
      inspection.inspectedBytes > MAX_JXL_INSPECTION_BYTES ||
      inspection.maximumReadBytes > MAX_READ_BYTES ||
      inspection.peakDecoderAllocationBytes > 8 * 1024 * 1024
    ) {
      throw new Error("JPEG XL inspector returned invalid bounded metadata.");
    }
    workerScope.postMessage({ ok: true, inspection });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: (
        error instanceof Error
          ? error.message
          : "JPEG XL header inspection failed."
      ).slice(0, MAX_WORKER_RESPONSE_TEXT_CHARS),
    });
  } finally {
    workerScope.close();
  }
}
