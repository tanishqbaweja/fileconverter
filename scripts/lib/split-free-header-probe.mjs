import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
import { createSplitAbortProbe } from "./split-abort-probe.mjs";
export function createSplitFreeHeaderProbe({ heap, emit = console.debug, ...options }) {
  const abort = createSplitAbortProbe({ ...options, emit }); let events = 0;
  return what => {
    try {
      if (events++ < 2) {
        let state = null, error = null;
        try { state = inspectDlmallocFreeHeaders(heap()); } catch (failure) { error = String(failure).slice(0, 512); }
        const record = { available: Boolean(state), state, error, scope: "failure-only-readonly-malloc-headers-not-acceptance" };
        const text = JSON.stringify(record);
        if (text.length > 8192) throw new Error("Free-header diagnostic output cap");
        emit("WITHIN_MPEG2_FREE_HEADERS " + text);
      }
    } catch { /* Diagnostics must not replace normal abort handling. */ }
    finally { abort(what); }
  };
}
