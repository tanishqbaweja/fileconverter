// Component-only browser diagnostic. NO files, codec open/send or conversion.
import encoderFactory from "/engines/remux/_private_split_encoder.mjs";
import decoderFactory from "/engines/remux/_private_split_decoder.mjs";
let encoder = null, decoder = null, busy = false;
const forbiddenIo = () => { throw new Error("Initialization diagnostic must never perform media I/O"); };
self.onmessage = async ({ data }) => {
  if (busy || !["encoder", "decoder", "release"].includes(data)) {
    self.postMessage({ error: "Invalid or overlapping initialization diagnostic command" }); return;
  }
  busy = true;
  try {
    if (data === "encoder") {
      if (encoder || decoder) throw new Error("Unexpected initialized module");
      encoder = await encoderFactory({ locateFile: () => "/engines/remux/_private_split_encoder.wasm", print: () => {}, printErr: () => {} });
      if (encoder.HEAPU8.byteLength !== 16777216) throw new Error("Actual encoder heap mismatch");
    } else if (data === "decoder") {
      if (!encoder || decoder) throw new Error("Unexpected module order");
      decoder = await decoderFactory({ locateFile: () => "/engines/remux/_private_split_decoder.wasm",
        print: () => {}, printErr: () => {}, withinSplit: { call: forbiddenIo },
        withinBridge: { inputSize: 0, copyOutput: false, cancelled: () => false,
          read: forbiddenIo, write: forbiddenIo, truncate: forbiddenIo, flush: forbiddenIo,
          progress: forbiddenIo, message: () => {} } });
      if (decoder.HEAPU8.byteLength !== 33554432) throw new Error("Actual decoder heap mismatch");
    } else {
      if (encoder && encoder._within_split_encoder_close() !== 0) throw new Error("Encoder module close failed");
      encoder = null; decoder = null;
    }
    self.postMessage({ action: data, encoderBytes: encoder?.HEAPU8.byteLength ?? 0,
      decoderBytes: decoder?.HEAPU8.byteLength ?? 0, conversionsPerformed: 0 });
  } catch (error) { self.postMessage({ error: String(error).slice(0, 512) }); }
  finally { busy = false; }
};
