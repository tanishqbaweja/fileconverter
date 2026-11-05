import { runIsolatedWebCodecsVp9 } from "./webcodecs-vp9-isolated";
import type { Vp9WorkerRequest } from "./webcodecs-vp9-worker-protocol";
const scope = self as unknown as { onmessage: ((event: MessageEvent<Vp9WorkerRequest>) => void) | null; postMessage(value: unknown): void; close(): void };
let running = false;
scope.onmessage = async ({ data }) => {
  if (running) return;
  running = true;
  try {
    scope.postMessage(await runIsolatedWebCodecsVp9(data, {
      createChild: () => new Worker("/engines/webcodecs-vp9/qualification.mjs", { type: "module", name: "within-private-vp9-attempt" }),
      progress: message => scope.postMessage(message),
    }));
  } catch (error) {
    scope.postMessage({ type: "error", message: String(error).slice(0, 4096),
      errorName: error instanceof Error || error instanceof DOMException ? error.name : "Error" });
  } finally { scope.close(); }
};
