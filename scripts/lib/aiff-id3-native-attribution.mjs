// Private allocation diagnostic. Neither allocator values nor tracing prove acceptance.
import assert from "node:assert/strict";
import { connectRealmSampler } from "./cdp-realm-memory.mjs";
import { startBoundedRendererAttribution } from "./bounded-renderer-attribution.mjs";

export async function startAiffNativeAttribution(browser, port, origin, {
  fetchVersion = fetch, connectSampler = connectRealmSampler,
  startAttribution = startBoundedRendererAttribution,
} = {}) {
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
  let realms = null, session = null, attribution = null, stopped = null;
  try {
    const response = await fetchVersion(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.ok, true);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength; assert.ok(bytes <= 16384, "Owned browser metadata cap"); chunks.push(chunk);
    }
    const socket = new URL(JSON.parse(Buffer.concat(chunks, bytes)).webSocketDebuggerUrl);
    assert.equal(socket.protocol, "ws:"); assert.equal(socket.hostname, "127.0.0.1"); assert.equal(socket.port, String(port));
    assert.match(socket.pathname, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
    realms = await connectSampler(socket.href, origin);
    session = await browser.newBrowserCDPSession();
    attribution = await startAttribution(session, realms);
  } catch (error) {
    realms?.close(); await session?.detach().catch(() => {}); throw error;
  }
  const phases = new Set();
  return {
    async dumpOnce(phase, processes) {
      assert.match(phase, /^(?:blank-idle|loaded-idle|conversion-[1-3]|cleanup-[1-3])$/);
      if (phases.has(phase)) return null;
      assert.ok(phases.size < 8); phases.add(phase);
      return attribution.dump(phase, processes);
    },
    stop() {
      stopped ??= (async () => {
        let timer, result = null, error = null;
        try {
          result = await Promise.race([attribution.stop(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Native attribution shutdown exceeded25seconds")), 25000);
          })]);
        } catch (failure) { error = String(failure.stack ?? failure).slice(0, 4096); }
        finally { clearTimeout(timer); realms.close(); await session.detach().catch(() => {}); }
        return { diagnosticOnly: true, productionAcceptance: false, allocationCauseProven: false,
          noForcedGarbageCollection: true, phaseCount: phases.size, phases: [...phases],
          separateCompleteTreeOsMetricUnchanged: true, error, result,
          caveat: "Light dump snapshots and overlapping allocator providers; no callsite, leak, earlier-failure cause or production-fix proof." };
      })();
      return stopped;
    },
  };
}
