// One private debugger statement at the EXISTING native abort. No hot-path
// breakpoints, extra buffers, core rebuild, changed codec options or heap growth.
import { createSplitAbortProbe } from "./split-abort-probe.mjs";
export function createSplitAbortPause(options) {
  return createSplitAbortProbe({ ...options, onAbort(what) {
    debugger;
    if (options.onAbort) return options.onAbort(what);
  } });
}
