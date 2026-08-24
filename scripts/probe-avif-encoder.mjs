import { closeSync, fstatSync, ftruncateSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const engineDir = path.resolve(root, process.argv[2] ?? "work/avif-encoder-probe");
const staticModulePath = path.join(engineDir, "within-avif-encoder.mjs");
const staticWasmPath = path.join(engineDir, "within-avif-encoder.wasm");
const animationModulePath = path.join(
  engineDir,
  "within-avif-animation-encoder.mjs",
);
const animationWasmPath = path.join(
  engineDir,
  "within-avif-animation-encoder.wasm",
);
const staticFactory = (await import(pathToFileURL(staticModulePath).href)).default;
const animationFactory = (
  await import(pathToFileURL(animationModulePath).href)
).default;
const staticCompiled = await WebAssembly.compile(readFileSync(staticWasmPath));
const animationCompiled = await WebAssembly.compile(
  readFileSync(animationWasmPath),
);

const cases = [
  { name: "opaque-still", width: 96, height: 64, alpha: false, durations: [0], loop: 0 },
  { name: "alpha-still", width: 80, height: 72, alpha: true, durations: [0], loop: 0 },
  {
    name: "alpha-animation",
    width: 64,
    height: 48,
    alpha: true,
    durations: [100_000, 200_000, 300_000],
    loop: 2,
  },
];

const summaries = [];
for (const definition of cases) {
  const outputPath = path.join(engineDir, `${definition.name}.avif`);
  const descriptor = openSync(outputPath, "w+");
  const errors = [];
  let encoderInstance;
  let frameIndex = 0;
  let maxWriteBytes = 0;
  let writeCount = 0;
  let truncateCount = 0;
  let flushCount = 0;
  const bridge = {
    rows(destination, y, rows, width) {
      const length = width * rows * 4;
      if (!encoderInstance || destination < 0 || destination + length > encoderInstance.HEAPU8.byteLength) return -1;
      let offset = destination;
      for (let row = 0; row < rows; row += 1) {
        for (let x = 0; x < width; x += 1) {
          const absoluteY = y + row;
          encoderInstance.HEAPU8[offset] = (x * 5 + absoluteY * 3 + frameIndex * 31) & 255;
          encoderInstance.HEAPU8[offset + 1] = (x * 2 + absoluteY * 7 + frameIndex * 47) & 255;
          encoderInstance.HEAPU8[offset + 2] = (x * 11 + absoluteY + frameIndex * 13) & 255;
          encoderInstance.HEAPU8[offset + 3] = definition.alpha
            ? (x * 9 + absoluteY * 5 + frameIndex * 17) & 255
            : 255;
          offset += 4;
        }
      }
      return length;
    },
    async write(offset, source) {
      if (!Number.isSafeInteger(offset) || offset < 0 || source.byteLength > 64 * 1024) return -1;
      const written = writeSync(descriptor, source, 0, source.byteLength, offset);
      maxWriteBytes = Math.max(maxWriteBytes, written);
      writeCount += 1;
      return written;
    },
    async truncate(size) {
      ftruncateSync(descriptor, size);
      truncateCount += 1;
    },
    async flush() {
      fsyncSync(descriptor);
      flushCount += 1;
    },
    message(message) {
      errors.push(String(message).slice(0, 512));
    },
  };
  try {
    const animated = definition.durations.length > 1;
    const factory = animated ? animationFactory : staticFactory;
    const compiled = animated ? animationCompiled : staticCompiled;
    const expectedHeapBytes = (animated ? 88 : 80) * 1024 * 1024;
    encoderInstance = await factory({
      withinBridge: bridge,
      instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(compiled, imports);
        receive(instance, compiled);
        return instance.exports;
      },
      print() {},
      printErr(message) {
        errors.push(String(message).slice(0, 512));
      },
    });
    const probe = encoderInstance.ccall("within_avif_encoder_probe", "number", [], []);
    if (probe !== 0 || encoderInstance.HEAPU8.byteLength !== expectedHeapBytes) {
      throw new Error(`Unexpected runtime probe ${probe} or heap ${encoderInstance.HEAPU8.byteLength}.`);
    }
    const start = await encoderInstance.ccall(
      "within_avif_encoder_start",
      "number",
      ["number", "number", "number", "number", "number"],
      [definition.width, definition.height, definition.alpha ? 1 : 0, animated ? 1 : 0, definition.loop],
      { async: true },
    );
    if (start !== 0) throw new Error(`start=${start}: ${encoderInstance.UTF8ToString(encoderInstance._within_avif_encoder_error(), 1024)}`);
    for (let index = 0; index < definition.durations.length; index += 1) {
      frameIndex = index;
      const result = await encoderInstance.ccall(
        "within_avif_encoder_add_frame",
        "number",
        ["number"],
        [definition.durations[index]],
        { async: true },
      );
      if (result !== 0) throw new Error(`frame ${index}=${result}: ${encoderInstance.UTF8ToString(encoderInstance._within_avif_encoder_error(), 1024)}`);
    }
    const finish = await encoderInstance.ccall(
      "within_avif_encoder_finish",
      "number",
      [],
      [],
      { async: true },
    );
    if (finish !== 0) throw new Error(`finish=${finish}: ${encoderInstance.UTF8ToString(encoderInstance._within_avif_encoder_error(), 1024)}`);
    const outputBytes = encoderInstance._within_avif_encoder_output_bytes();
    const statBytes = fstatSync(descriptor).size;
    if (outputBytes !== statBytes || outputBytes < 1) {
      throw new Error(`Output mismatch: native ${outputBytes}, file ${statBytes}.`);
    }
    const encoded = readFileSync(outputPath);
    const boxes = [];
    for (let offset = 0; offset + 8 <= encoded.byteLength;) {
      const size = encoded.readUInt32BE(offset);
      const type = encoded.toString("ascii", offset + 4, offset + 8);
      if (size < 8 || offset + size > encoded.byteLength) throw new Error(`Invalid ${type} box at ${offset}.`);
      boxes.push({ type, offset, size });
      offset += size;
    }
    const expected = animated ? ["ftyp", "free", "mdat", "meta", "moov"] : ["ftyp", "free", "mdat", "meta"];
    if (JSON.stringify(boxes.map((box) => box.type)) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected box order: ${boxes.map((box) => box.type).join(",")}.`);
    }
    summaries.push({
      name: definition.name,
      outputPath,
      outputBytes,
      heapBytes: encoderInstance.HEAPU8.byteLength,
      frameBytes: encoderInstance._within_avif_encoder_frame_bytes(),
      stripBytes: encoderInstance._within_avif_encoder_strip_bytes(),
      maxWriteBytes,
      writeCount,
      truncateCount,
      flushCount,
      boxes,
      errors,
    });
  } finally {
    encoderInstance?._within_avif_encoder_destroy();
    closeSync(descriptor);
  }
}

process.stdout.write(`${JSON.stringify({ cases: summaries }, null, 2)}\n`);
