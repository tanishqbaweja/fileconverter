// Bounded official compiler-source audit; no file/media reads or local scratch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

for (const [name, expected] of [
  ["settings.js", "e336f223173593ffa4e576cd91988bef9f9979ca3ba9b0edcb289182005c4a86"],
  ["lib/libasync.js", "d9a177e81b2eef521c12b0dfa21e5d17a027e8b245b830c374bf258808b0951e"],
  ["lib/libcore.js", "6af1975989546cc86aa15041f324f2499da1a2782e3015d6df89f339a47c9d8d"],
]) {
  const response = await fetch(`https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/src/${name}`,
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); assert.ok(Number(response.headers.get("content-length") ?? 0) <= 131072);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length <= 131072);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  const source = new TextDecoder().decode(bytes);
  if (name === "settings.js") {
    assert.match(source, /var STACK_SIZE = 64\*1024/);
    assert.match(source, /var ASYNCIFY_STACK_SIZE = 4096/);
    assert.match(source, /adds a check to all\s*\/\/\s*stack pointer assignments/);
  } else if (name === "lib/libasync.js") {
    assert.match(source, /StackSize: \{\{\{ ASYNCIFY_STACK_SIZE \}\}\}/);
    assert.match(source, /allocateData\(\)/);
  } else {
    assert.match(source, /#if STACK_OVERFLOW_CHECK >= 2/);
    assert.match(source, /___set_stack_limits\(stackLow, stackHigh\)/);
    assert.match(source, /__handle_stack_overflow:/);
  }
  process.stdout.write(`${name}: ${bytes.length} bytes, SHA256 ${expected}\n`);
}
