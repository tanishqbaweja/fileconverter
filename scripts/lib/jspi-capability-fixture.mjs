// A 56-byte arithmetic fixture only. No media, filesystem, codec or memory claim.
// Self-contained so the same exact function runs in the page and dedicated worker.
export async function exerciseJspiCapability() {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(typeof WebAssembly.Suspending === "function" && typeof WebAssembly.promising === "function", "Stable JSPI APIs unavailable");
  const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,127,1,127,
    2,12,1,3,101,110,118,4,115,116,101,112,0,0,3,2,1,0,7,7,1,3,114,117,110,0,1,
    10,11,1,9,0,32,0,16,0,65,1,106,11]);
  const compiled = await WebAssembly.compile(bytes);
  let mode = "delayed", calls = 0, release, pending = 0, peakPending = 0;
  const rejection = new Error("Owned arithmetic rejection"), thrown = new Error("Owned arithmetic throw");
  const step = new WebAssembly.Suspending(value => {
    calls++;
    if (mode === "reject") return Promise.reject(rejection);
    if (mode === "throw") throw thrown;
    if (mode === "sync") return value * 2;
    pending++; peakPending = Math.max(peakPending, pending);
    return new Promise(resolve => { release = () => { pending--; resolve(value * 2); }; });
  });
  const instance = await WebAssembly.instantiate(compiled, { env: { step } });
  const run = WebAssembly.promising(instance.exports.run);
  let settled = false; const first = run(41).then(value => { settled = true; return value; });
  check(first instanceof Promise && typeof release === "function", "JSPI did not suspend through import");
  await Promise.resolve(); check(!settled && pending === 1, "Wasm continued before asynchronous import resolved");
  release(); check(await first === 83 && pending === 0, "Resumed arithmetic result mismatch");
  mode = "reject"; let rejected = false;
  try { await run(1); } catch (error) { rejected = error === rejection; }
  check(rejected, "Promise rejection was not propagated exactly");
  mode = "throw"; let thrownExactly = false;
  try { await run(1); } catch (error) { thrownExactly = error === thrown; }
  check(thrownExactly, "Synchronous import exception was not propagated exactly");
  mode = "sync"; let checksum = 0;
  for (let index = 0; index < 128; index++) {
    const value = run(index); check(value instanceof Promise, "Promising export did not return Promise");
    checksum += await value;
  }
  check(checksum === 16384 && calls === 131 && peakPending === 1, "Repeated-call or pending bound mismatch");
  return { moduleBytes: bytes.length, calls, checksum, delayedResult: 83, peakPending,
    promiseRejectionPropagated: rejected, synchronousThrowPropagated: thrownExactly,
    repeatedCalls: 128, noExperimentalFlagsRequired: true, conversions: 0 };
}
