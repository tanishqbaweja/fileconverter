// Explicit MPEG-2 production AVIO integration, not public route acceptance.
// The qualified native binaries remain separate, lazily supplied modules. This
// owner replaces the experimental profile-1 -> profile-6 remux substitution.
import { createMpeg2SplitSession } from "../scripts/lib/mpeg2-split-session.mjs";
import { MPEG2_VIDEO_BIT_RATE_BPS } from "../lib/mpeg2-stage-policy";
export { assertMpeg2Options as assertMpeg2SplitOptions } from "../lib/mpeg2-stage-policy";
import type { RemuxBridge, RemuxFactoryOptions, RemuxModule } from "./media-remux";

const DECODER_BYTES = 32 * 1024 * 1024;
const ENCODER_BYTES = 16 * 1024 * 1024;
const NATIVE_STACK_BYTES = 256 * 1024;
const MAX_AVIO_BYTES = 256 * 1024;
const BIT_RATE = MPEG2_VIDEO_BIT_RATE_BPS;

interface FixedCore {
  HEAPU8: Uint8Array;
  _emscripten_stack_get_base: () => number;
  _emscripten_stack_get_end: () => number;
}

export interface Mpeg2EncoderCore extends FixedCore {
  _within_split_encoder_open: () => number;
  _within_split_encoder_close: () => number;
  _within_split_encoder_config: () => number;
  _within_split_encoder_settings_match: () => number;
}

export interface Mpeg2DecoderCore extends FixedCore, RemuxModule {}

type SplitSession = ReturnType<typeof createMpeg2SplitSession>;

export interface Mpeg2SplitCore {
  decoderFactory: (options: RemuxFactoryOptions & { withinSplit: SplitSession }) => Promise<Mpeg2DecoderCore>;
  encoderFactory: (options: Pick<RemuxFactoryOptions, "locateFile" | "print" | "printErr" | "instantiateWasm">) => Promise<Mpeg2EncoderCore>;
  decoderWasmUrl: string;
  encoderWasmUrl: string;
}

function fixedHeap(core: FixedCore, bytes: number): Uint8Array {
  const heap = core.HEAPU8;
  if (!(heap instanceof Uint8Array) || heap.byteOffset !== 0 || heap.byteLength !== bytes || heap.buffer.byteLength !== bytes) {
    throw new Error("MPEG-2 requires complete fixed-size decoder/encoder heaps.");
  }
  if (core._emscripten_stack_get_base() - core._emscripten_stack_get_end() !== NATIVE_STACK_BYTES) {
    throw new Error("MPEG-2 native stack must remain exactly 256 KiB.");
  }
  return heap;
}

function assetUrl(url: string): string {
  if (typeof url !== "string" || !/^\/engines\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.wasm$/.test(url)) {
    throw new Error("MPEG-2 native assets must be same-origin engine files.");
  }
  return url;
}

function nativeArguments(args: readonly number[]): number[] {
  if (!Array.isArray(args) || args.length !== 12 || args[0] !== 40 ||
      Array.from(args).some((value, index) => !Number.isSafeInteger(value) ||
        (index > 0 && index !== 9 && value !== 0)) || (args[9] !== 0 && args[9] !== BIT_RATE)) {
    throw new Error("MPEG-2 requires explicit profile 40 and its twelve supported arguments.");
  }
  const mapped = [...args];
  mapped[0] = 6; // Private native kernel sentinel, NOT production FLAC profile 6.
  mapped[9] = BIT_RATE;
  return mapped;
}

export async function createMpeg2SplitRuntime(options: RemuxFactoryOptions, cores: Mpeg2SplitCore) {
  const wasm = WebAssembly as typeof WebAssembly & { Suspending?: unknown; promising?: unknown };
  if (typeof wasm.Suspending !== "function" || typeof wasm.promising !== "function") {
    throw new Error("MPEG-2 requires stable WebAssembly JSPI support; no full-memory fallback is available.");
  }
  const decoderUrl = assetUrl(cores.decoderWasmUrl), encoderUrl = assetUrl(cores.encoderWasmUrl);
  if (typeof cores.decoderFactory !== "function" || typeof cores.encoderFactory !== "function") {
    throw new Error("MPEG-2 requires both native module factories.");
  }
  let encoder: Mpeg2EncoderCore | null = null, decoder: Mpeg2DecoderCore | null = null;
  let session: SplitSession | null = null;
  let decoderHeap: Uint8Array | null = null, encoderHeap: Uint8Array | null = null;
  let activeCalls = 0, calls = 0, failedCalls = 0, closed = false;
  let activeIo = false, maximumMediaAvioWriteBytes = 0;
  let retainedBridge: RemuxBridge | null = options.withinBridge;
  const assertActive = () => {
    if (!retainedBridge) throw new Error("MPEG-2 runtime is closed.");
    if (retainedBridge.cancelled()) throw new DOMException("Conversion cancelled", "AbortError");
  };
  const assertHeaps = () => {
    if (!encoder || !decoder || fixedHeap(encoder, ENCODER_BYTES) !== encoderHeap ||
        fixedHeap(decoder, DECODER_BYTES) !== decoderHeap) {
      throw new Error("MPEG-2 native heaps changed during conversion.");
    }
  };
  const beginIo = () => {
    assertActive();
    if (activeIo) throw new Error("MPEG-2 AVIO permits only one pending operation, never a queue.");
    activeIo = true;
  };
  const bounded = (bytes: Uint8Array) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_AVIO_BYTES) {
      throw new Error("MPEG-2 AVIO exceeds the fixed 256 KiB chunk limit.");
    }
  };
  const dispose = () => {
    if (activeCalls || activeIo) throw new Error("Cannot dispose an active MPEG-2 native operation.");
    if (closed) return;
    try {
      if (session) session.close();
      else if (encoder && encoder._within_split_encoder_close() !== 0) throw new Error("MPEG-2 native encoder cleanup failed.");
    } finally {
      closed = true;
      encoder = decoder = null;
      encoderHeap = decoderHeap = null;
      session = null;
      retainedBridge = null;
    }
  };
  const disposeAfterFailure = (error: unknown): never => {
    try { dispose(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "MPEG-2 conversion and cleanup failed."); }
    throw error;
  };
  try {
    assertActive();
    encoder = await cores.encoderFactory({ locateFile: () => encoderUrl, print: options.print, printErr: options.printErr });
    encoderHeap = fixedHeap(encoder, ENCODER_BYTES);
    assertActive();
    const open = encoder._within_split_encoder_open.bind(encoder);
    encoder._within_split_encoder_open = () => {
      const result = open();
      if (result >= 0) {
        // Audit actual native AVCodecContext, not only requested JS arguments.
        const pointer = encoder!._within_split_encoder_config();
        if (!Number.isSafeInteger(pointer) || pointer <= 0 || pointer > ENCODER_BYTES - 96) {
          throw new Error("Invalid MPEG-2 native encoder configuration slot.");
        }
        const wire = new DataView(encoderHeap!.buffer, pointer, 96);
        const word = (index: number) => wire.getUint32(index * 4, true);
        if (encoder!._within_split_encoder_settings_match() !== 1 || word(0) !== 1 ||
            word(1) < 2 || word(1) > 4096 || word(1) % 2 || word(2) < 2 || word(2) > 2160 || word(2) % 2 ||
            word(3) > 1 || !word(6) || !word(7) || word(8) !== BIT_RATE || word(9) !== 4 || word(10) !== 20) {
          throw new Error("Actual MPEG-2 native encoder settings differ from the selected policy.");
        }
      }
      return result;
    };
    session = createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled });
    const bridge = options.withinBridge;
    decoder = await cores.decoderFactory({ ...options, locateFile: () => decoderUrl, withinSplit: session,
      withinBridge: { ...bridge, readSync: undefined,
        async read(offset, destination) {
          bounded(destination); beginIo();
          try { return await bridge.read(offset, destination); } finally { activeIo = false; }
        },
        async write(offset, source) {
          bounded(source); beginIo();
          maximumMediaAvioWriteBytes = Math.max(maximumMediaAvioWriteBytes, source.byteLength);
          try { return await bridge.write(offset, source); } finally { activeIo = false; }
        },
        writeSync: bridge.writeSync ? (offset, source) => {
          bounded(source); beginIo();
          maximumMediaAvioWriteBytes = Math.max(maximumMediaAvioWriteBytes, source.byteLength);
          try { return bridge.writeSync!(offset, source); } finally { activeIo = false; }
        } : undefined,
        progress(sample) {
          assertHeaps();
          if (sample.wasmMemoryBytes !== DECODER_BYTES) throw new Error("MPEG-2 decoder memory report mismatch.");
          bridge.progress({ ...sample, wasmMemoryBytes: DECODER_BYTES + ENCODER_BYTES });
        },
      },
    });
    decoderHeap = fixedHeap(decoder, DECODER_BYTES);
    if (decoderHeap.buffer === encoderHeap.buffer) throw new Error("MPEG-2 needs independent decoder and encoder memories.");
    assertActive();
  } catch (error) { disposeAfterFailure(error); }

  return Object.freeze({
    dispose,
    metrics: () => Object.freeze({ calls, activeCalls, maximumActiveCalls: calls ? 1 : 0, failedCalls, closed,
      maximumMediaAvioWriteBytes, asyncifyLinearStackBytes: 0, engineManagedStackMemoryBytes: null }),
    async ccall(...parameters: Parameters<RemuxModule["ccall"]>): Promise<number> {
      if (closed) throw new Error("MPEG-2 runtime is closed; create a fresh conversion worker.");
      if (activeCalls) throw new Error("MPEG-2 permits only one active JSPI entry.");
      const [name, type, types, args, settings] = parameters;
      const mapped = nativeArguments(args);
      if (name !== "within_remux" || type !== "number" || types.length !== 12 ||
          Array.from(types).some(value => value !== "number") || settings?.async !== true) {
        throw new Error("Invalid MPEG-2 native call ABI.");
      }
      assertActive(); assertHeaps();
      calls++; activeCalls = 1;
      let result: number;
      try { result = await decoder!.ccall(name, type, types, mapped, settings); }
      catch (error) { failedCalls++; activeCalls = 0; return disposeAfterFailure(error); }
      activeCalls = 0;
      dispose();
      return result;
    },
  });
}
