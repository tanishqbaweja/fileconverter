// Execute the bundled production worker message handler in Node only.
// This double measures dispatch/fault/commit sequencing, NOT browser storage.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function loadTimedTextWorkerControl(root) {
  const entry = path.join(root, "workers/conversion.worker.ts");
  const bundle = await build({ absWorkingDir: root, entryPoints: [entry], platform: "browser",
    bundle: true, write: false, format: "esm", define: { "import.meta.url": JSON.stringify(pathToFileURL(entry).href) } });
  const scope = { location: { hostname: "localhost" }, setTimeout };
  let waiter;
  let ready = false;
  scope.postMessage = message => {
    if (message.type === "ready") ready = true;
    else if (["complete", "error", "cancelled"].includes(message.type)) waiter?.(message);
  };
  const saved = Object.getOwnPropertyDescriptor(globalThis, "self");
  Object.defineProperty(globalThis, "self", { configurable: true, value: scope });
  try {
    await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
  } finally {
    if (saved) Object.defineProperty(globalThis, "self", saved);
    else delete globalThis.self;
  }
  assert.ok(ready);
  return async ({ file, format, trackId, hostname = "localhost", fault, cancel }) => {
    scope.location.hostname = hostname;
    const initial = Buffer.from("previous committed destination");
    let committed = initial, pending = 0, opened = 0, closed = 0, aborted = 0, writes = 0;
    const parts = [];
    let bytesStaged = 0;
    const id = "timed-text-" + crypto.randomUUID();
    const send = data => scope.onmessage({ data });
    const handle = { async createWritable(options) {
      opened++;
      assert.deepEqual(options, { keepExistingData: false });
      return {
        async truncate(size) { assert.equal(size, 0); },
        async write(bytes) {
          assert.equal(++pending, 1);
          assert.ok(bytes instanceof Uint8Array && bytes.byteLength <= 65536);
          bytesStaged += bytes.byteLength;
          assert.ok(bytesStaged <= 1_048_576, "test double keeps only small fixture outputs");
          parts.push(Buffer.from(bytes)); writes++;
          if (cancel) send({ type: "cancel", jobId: id });
          await new Promise(resolve => setImmediate(resolve));
          pending--;
        },
        async close() {
          assert.equal(pending, 0);
          assert.equal(aborted, 0);
          committed = Buffer.concat(parts); closed++;
        },
        async abort() { assert.equal(pending, 0); parts.length = 0; aborted++; },
      };
    } };
    let timer;
    const terminal = await new Promise((resolve, reject) => {
      waiter = resolve;
      timer = setTimeout(() => reject(new Error("Worker control terminal timeout")), 5000);
      send({ type: "start", jobId: id, profileId: format + "-to-vtt", file, timedTextTrackId: trackId,
        destination: { mode: "handle", handle }, testFault: fault });
    }).finally(() => { clearTimeout(timer); waiter = undefined; });
    return { terminal, committed, previousUnchanged: committed === initial, opened, closed, aborted, writes };
  };
}
