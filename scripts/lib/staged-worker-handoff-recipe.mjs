// Reversible private production overlays. Normal application/worker remain exact.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeStagedHandoffApp(source) {
  assert.equal(sha(source), "b93cb0095b0286f84e58fe8b9bc6ae4bc415b5487d9e06b0fc72f365f37bce6b");
  return exactPatch(source, [
    ['"use client";', '"use client";\nimport { createStagedWorkerCoordinator } from "../../lib/staged-worker-coordinator";'],
    ['      const worker = new Worker(\n        new URL("../../workers/conversion.worker.ts", import.meta.url),\n        { name: "within-conversion" },\n      );',
      '      const worker = createStagedWorkerCoordinator(\n        () => new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), { name: "within-conversion" }),\n        () => new Worker(new URL("../../workers/staged-save.worker.ts", import.meta.url), { name: "within-final-save" }),\n      );'],
    ['  const startConversion = async () => {\n    const worker = workerRef.current;',
      '  const startConversion = async () => {\n    if (jobIdRef.current) return;\n    const worker = workerRef.current;'],
  ]);
}
export function makeStagedHandoffWorker(source) {
  assert.equal(sha(source), "6349cbe78fe0c3ece7c7f285a4eb1f8b6a09155ab9a9f44319f9d12566791d68");
  const marker = '        finalWritable = await finalHandle.createWritable({';
  const handoff = `        if (profileId === "mkv-to-mp4") {
          const handoff: StagedCopyHandoff = {
            type: "staged-copy-handoff", jobId, profileId, stagingName, stageClosed: true,
            jobStartedEpochMs: performance.timeOrigin + startedAt, metrics: { ...metrics },
          };
          workerScope.postMessage(handoff);
          // The host retires this fully closed codec worker before starting the
          // Wasm-free save worker. Never resolve close() into a false completion.
          await new Promise<void>(() => {});
          return;
        }

`;
  const recipe = exactPatch(source, [
    ['const STAGED_MKV_COPY_CHUNK = 512 * 1024;', 'import type { StagedCopyHandoff } from "../lib/staged-copy-protocol";\nconst STAGED_MKV_COPY_CHUNK = 512 * 1024;'],
    [marker, handoff + marker],
  ]);
  return { ...recipe, publicAcceptance: false, originalCodecSettingsChanged: false, copyBufferBytes: 524288,
    fullOriginalAcceptance: false, primaryMemoryAcceptance: false, speedGainProven: false };
}
