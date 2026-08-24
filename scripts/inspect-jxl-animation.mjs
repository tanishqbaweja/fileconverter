import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(projectRoot, process.argv[2] ?? "");
const maximumInputBytes = 64 * 1024 * 1024;
const maximumOutputChunkBytes = 64 * 1024;

assertProjectLocal(inputPath);
const inputStat = await stat(inputPath);
if (!inputStat.isFile() || inputStat.size < 2 || inputStat.size > maximumInputBytes) {
  throw new Error("JPEG XL metadata inspection requires a 2-byte to 64 MiB project-local file.");
}

const [input, wasmBytes] = await Promise.all([
  readFile(inputPath),
  readFile(path.join(projectRoot, "public", "engines", "jxl", "within-jxl.wasm")),
]);
const moduleUrl = pathToFileURL(
  path.join(projectRoot, "public", "engines", "jxl", "within-jxl.mjs"),
).href;
const { default: createWithinJxlModule } = await import(moduleUrl);
const frames = [];
const messages = [];
let activeFrame = null;
let maximumPngChunkBytes = 0;

const decoderModule = await createWithinJxlModule({
  instantiateWasm(imports, receiveInstance) {
    void WebAssembly.instantiate(wasmBytes, imports).then(({ instance }) => {
      receiveInstance(instance);
    });
    return {};
  },
  withinBridge: {
    read(offset, destination) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > input.byteLength) return -1;
      const length = Math.min(destination.byteLength, input.byteLength - offset);
      destination.set(input.subarray(offset, offset + length));
      return length;
    },
    write(offset, source) {
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        source.byteLength > maximumOutputChunkBytes ||
        !activeFrame
      ) {
        return -1;
      }
      maximumPngChunkBytes = Math.max(maximumPngChunkBytes, source.byteLength);
      return source.byteLength;
    },
    frameStart(
      index,
      durationTicks,
      timecode,
      isLast,
      width,
      height,
      bitsPerSample,
      channels,
      ticksPerSecondNumerator,
      ticksPerSecondDenominator,
      numLoops,
      haveTimecodes,
    ) {
      if (activeFrame || index !== frames.length) return -1;
      activeFrame = {
        index,
        durationTicks,
        timecode,
        isLast: isLast !== 0,
        width,
        height,
        bitsPerSample,
        channels,
        ticksPerSecondNumerator,
        ticksPerSecondDenominator,
        numLoops,
        haveTimecodes: haveTimecodes !== 0,
      };
      frames.push(activeFrame);
      return 0;
    },
    frameEnd(index) {
      if (!activeFrame || activeFrame.index !== index) return -1;
      activeFrame = null;
      return 0;
    },
    message(message) {
      if (messages.length < 8) messages.push(String(message).slice(0, 512));
    },
  },
  locateFile(name) {
    return name;
  },
  print() {},
  printErr(message) {
    if (messages.length < 8) messages.push(String(message).slice(0, 512));
  },
});

const result = await decoderModule.ccall(
  "within_jxl_to_png_frames",
  "number",
  ["number"],
  [input.byteLength],
  { async: true },
);
if (result !== 0 || activeFrame) {
  const nativeError = decoderModule.UTF8ToString(
    decoderModule._within_jxl_error(),
    1024,
  );
  throw new Error(
    [nativeError, ...messages].filter(Boolean).join(" | ") ||
      `JPEG XL metadata inspection failed with code ${result}.`,
  );
}

process.stdout.write(
  `${JSON.stringify({
    inputBytes: input.byteLength,
    width: decoderModule._within_jxl_width(),
    height: decoderModule._within_jxl_height(),
    bitsPerSample: decoderModule._within_jxl_bits(),
    channels: decoderModule._within_jxl_channels(),
    hasAnimation: decoderModule._within_jxl_has_animation() !== 0,
    frameCount: decoderModule._within_jxl_frame_count(),
    peakDecoderAllocationBytes: decoderModule._within_jxl_peak_decoder_allocation(),
    maximumPngChunkBytes,
    frames,
  })}\n`,
);

function assertProjectLocal(target) {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside the project: ${target}`);
  }
}
