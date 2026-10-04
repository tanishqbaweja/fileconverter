import { createNativeMemoryPeaks } from "./native-memory-peaks.mjs";
import { startChromiumMemoryMonitor } from "./persistent-chromium-memory.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startParallelMemoryObserver(rootPid, temporary,
  { startMonitor = startChromiumMemoryMonitor, drainIntervalMs = 500, flushTimeoutMs = 5000 } = {}) {
  const history = createNativeMemoryPeaks(rootPid);
  history.setPhase("blank-baseline");
  const monitor = await startMonitor(rootPid, temporary, 100);
  let live = true, fatal = null, stopped = null;
  const healthy = () => { if (fatal) throw fatal; };
  const pump = (async () => {
    try {
      while (live) { history.consume(await monitor.drain()); await delay(drainIntervalMs); }
    } catch (error) { fatal = error; live = false; }
  })();
  return {
    pid: monitor.pid,
    healthy,
    setPhase: (phase) => { healthy(); return history.setPhase(phase); },
    report: () => ({ ...history.report(), error: fatal?.message ?? null }),
    peaks: (phases) => { healthy(); return history.peaks(phases); },
    async through(at) {
      const deadline = Date.now() + flushTimeoutMs;
      while ((history.lastAcquiredAt() ?? -Infinity) < at) {
        healthy();
        if (stopped) throw new Error("Native observer stopped before coverage flush");
        if (Date.now() >= deadline) throw new Error("Native coverage flush deadline exceeded; no CIM-only acceptance fallback");
        await delay(25);
      }
      healthy();
    },
    stop() {
      stopped ??= (async () => {
        live = false; await pump;
        try { healthy(); history.consume(await monitor.drain()); }
        catch (error) { fatal ??= error; }
        finally { try { await monitor.close(); } catch (error) { fatal ??= error; } }
        healthy();
      })();
      return stopped;
    },
  };
}
