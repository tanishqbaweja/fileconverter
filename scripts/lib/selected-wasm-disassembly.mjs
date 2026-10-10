import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
export const WASM_LISTING_LIMITS = Object.freeze({ streamedBytes: 67108864, retainedBytes: 8388608,
  perFunctionBytes: 1048576, lineChars: 4096, functions: 32, stderrChars: 8192, timeoutMs: 20000 });
export function createSelectedWasmListingCollector(indices, limits = WASM_LISTING_LIMITS) {
  assert.ok(indices instanceof Set && indices.size > 0 && indices.size <= limits.functions);
  const decoder = new StringDecoder("utf8"), listings = new Map();
  let streamedBytes = 0, retainedBytes = 0, partial = "", active = null, closed = false;
  const line = value => {
    assert.ok(value.length <= limits.lineChars, "Disassembly line cap");
    const header = /^[0-9a-f]+ func\[(\d+)\](?: <[^>]+>)?:$/.exec(value);
    if (header) {
      const index = Number(header[1]); active = indices.has(index) ? index : null;
      if (active !== null) { assert.ok(!listings.has(active), "Duplicate selected function header"); listings.set(active, { parts: [], bytes: 0 }); }
    }
    if (active !== null) {
      const text = value + "\n", bytes = Buffer.byteLength(text), row = listings.get(active);
      retainedBytes += bytes; row.bytes += bytes;
      assert.ok(retainedBytes <= limits.retainedBytes, "Selected listing total cap");
      assert.ok(row.bytes <= limits.perFunctionBytes, "Selected function listing cap"); row.parts.push(text);
    }
  };
  const consume = value => {
    for (const part of value.split(/(?<=\n)/)) {
      partial += part; assert.ok(partial.length <= limits.lineChars + 1, "Incomplete disassembly line cap");
      if (part.endsWith("\n")) { line(partial.slice(0, -1).replace(/\r$/, "")); partial = ""; }
    }
  };
  return {
    feed(chunk) {
      assert.equal(closed, false); streamedBytes += chunk.byteLength;
      assert.ok(streamedBytes <= limits.streamedBytes, "Disassembly stream cap"); consume(decoder.write(chunk));
    },
    finish() {
      assert.equal(closed, false); consume(decoder.end()); if (partial) line(partial); partial = ""; closed = true;
      assert.equal(listings.size, indices.size, "All selected function listings required");
      return { streamedBytes, retainedBytes, discardedBytes: streamedBytes - retainedBytes, limits,
        listings: [...listings].map(([functionIndex, row]) => ({ functionIndex, text: row.parts.join(""), bytes: row.bytes })) };
    },
  };
}
export async function disassembleSelectedWasmFunctions(executable, toolPath, binaryPath, indices, options) {
  const collector = createSelectedWasmListingCollector(indices);
  const child = spawn(executable, [toolPath, "--disassemble", binaryPath], { ...options,
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: WASM_LISTING_LIMITS.timeoutMs });
  const completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
  void completion.catch(() => {});
  let stderr = ""; child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(0, WASM_LISTING_LIMITS.stderrChars); });
  try {
    for await (const chunk of child.stdout) collector.feed(chunk);
    const outcome = await completion; assert.equal(outcome.code, 0, `Owned static disassembler failed: ${outcome.signal ?? stderr}`);
    return { ...collector.finish(), toolExitCode: outcome.code, subprocessWindowsHidden: true, originalFunctionsExecuted: 0 };
  } finally {
    // child.kill uses this child's native handle; never sweep/kilI external PIDs.
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await completion.catch(() => {});
  }
}
