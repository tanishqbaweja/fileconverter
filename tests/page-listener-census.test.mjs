import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { installPageListenerCensus } from "../scripts/lib/page-listener-census.mjs";

test("diagnostic counts fixed target families without retaining events or filenames", () => {
  const result = runInNewContext(`
    class EventTarget {
      addEventListener(...args) { if (args[0] === 'fail') throw new Error('native failure'); this.last = args; }
      removeEventListener(...args) { this.last = args; }
    }
    class Node extends EventTarget {}
    class Worker extends EventTarget {}
    class AbortSignal extends EventTarget {}
    const window = new EventTarget(), document = new Node();
    const worker = new Worker(), node = new Node(), signal = new AbortSignal(), other = new EventTarget();
    const callback = () => {}, options = { passive: true };
    (${installPageListenerCensus})();
    node.addEventListener('private-name', callback, options);
    const originalArgumentsForwarded = node.last[1] === callback && node.last[2] === options;
    node.addEventListener('private-name', callback, options);
    node.removeEventListener('private-name', callback, true);
    window.addEventListener('pagehide', callback);
    document.addEventListener('pagehide', callback);
    signal.addEventListener('abort', callback);
    worker.addEventListener('message', callback);
    other.addEventListener('other', null);
    let rejected = false;
    try { other.addEventListener('fail', callback); } catch (error) { rejected = error.message === 'native failure'; }
    const first = window.__WITHIN_PAGE_LISTENER_CENSUS__();
    first.node.adds = 900;
    JSON.stringify({ originalArgumentsForwarded, rejected, calls: window.__WITHIN_PAGE_LISTENER_CENSUS__() });
  `);
  assert.ok(!result.includes("private-name"));
  assert.deepEqual(JSON.parse(result), { originalArgumentsForwarded: true, rejected: true, calls: {
    window: { adds: 1, removes: 0 }, document: { adds: 1, removes: 0 }, node: { adds: 2, removes: 1 },
    worker: { adds: 1, removes: 0 }, abortSignal: { adds: 1, removes: 0 }, other: { adds: 0, removes: 0 },
  } });
});
