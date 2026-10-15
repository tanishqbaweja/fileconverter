/// <reference lib="webworker" />
import type { CancelConversionMessage } from "../lib/conversion-protocol";
import type { StagedSaveRequest } from "../lib/staged-copy-protocol";
import { runStagedSave } from "./staged-save-runtime";
const scope: DedicatedWorkerGlobalScope = self as never;
let active: string | null = null, cancelled = false;
scope.onmessage = (event: MessageEvent<StagedSaveRequest | CancelConversionMessage>) => {
  const message = event.data;
  if (message.type === "cancel") { if (message.jobId === active) cancelled = true; return; }
  if (message.type !== "copy-staged" || active) {
    scope.postMessage({ type: "error", jobId: message.jobId, message: "The save worker is not available for another operation.", metrics: message.metrics }); return;
  }
  active = message.jobId; cancelled = false;
  const signal = message.cancellationBuffer?.byteLength === 4 ? new Int32Array(message.cancellationBuffer) : null;
  void runStagedSave(message, { storage: navigator.storage, post: response => scope.postMessage(response),
    isCancelled: () => cancelled || (signal !== null && Atomics.load(signal, 0) !== 0) })
    .finally(() => { active = null; cancelled = false; });
};
scope.postMessage({ type: "ready" });
