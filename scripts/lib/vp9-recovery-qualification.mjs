// Same-browser adverse-path/recovery qualification only, not a stress substitute.
import assert from "node:assert/strict";
import path from "node:path";
import { open, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { validateSmallVp9Fidelity } from "./small-vp9-fidelity.mjs";
import {assertPlatformVp9Terminal} from "./platform-vp9-terminal.mjs";
export const VP9_RECOVERY_PLAN = Object.freeze([
  { name: "cancel-after-real-write", fault: "cancel-after-write" },
  { name: "recovery-after-cancel", fault: null },
  { name: "injected-write-failure", fault: "write" },
  { name: "recovery-after-write-failure", fault: null },
  { name: "third-same-session-completion", fault: null },
].map(Object.freeze));
export async function qualifyVp9Recovery({ page, observer, evidence, root, directory, source, sourceProbe,
  ffmpeg, ffprobe, env, blankBaseline, loadedIdle, sampleChromiumTree, chromePid, initialOutputSha256,
  run = promisify(execFile),backend="isolated-cpu" }) {
  assert.ok(["isolated-cpu","platform"].includes(backend));
  assert.equal(blankBaseline?.stable, true); assert.ok(loadedIdle.privateBytes > 0);
  Object.assign(evidence, { scope: "One browser, real cancellation/write error plus three independently validated recoveries; NOT large-file/stress/public acceptance",
    plan: VP9_RECOVERY_PLAN, cases: [], passed: false, publicAcceptance: false, speedGainProven: false,
    maximumCleanupDeltaMiB: 96, unchangedBlankBaseline: blankBaseline.privateBytes, memory: null,backend });
  let destination, exported = 0;
  const phases = ["conversion"];
  await page.exposeBinding("__appendVp9RecoveryOutput", async ({ frame }, values) => {
    assert.equal(frame, page.mainFrame()); assert.ok(destination);
    assert.ok(Array.isArray(values) && values.length > 0 && values.length <= 65536 && values.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
    assert.ok(exported + values.length <= 2097152, "Bound this small diagnostic output, never grow with arbitrary file size");
    const bytes = Buffer.from(values); const result = await destination.write(bytes, 0, bytes.length, exported);
    assert.equal(result.bytesWritten, bytes.length); exported += bytes.length;
  });
  try {
    for (const [ordinal, entry] of VP9_RECOVERY_PLAN.entries()) {
      const row = { ordinal: ordinal + 1, name: entry.name, requestedFault: entry.fault, result: null, memory: null, validation: null,
        opfsRemoved: false, outputRemoved: false, passed: false };
      evidence.cases.push(row);
      const name = "within-private-vp9-recovery-" + ordinal + ".webm", output = path.join(directory, "recovery-" + ordinal + ".webm");
      let outputCreated = false;
      try {
        const phase = "vp9-recovery-" + ordinal; phases.push(phase); observer.setPhase(phase);
        row.result = await page.evaluate(async ({ name, fault,backend }) => {
          const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle(name, { create: true });
          const file = document.querySelector('input[type="file"]').files[0], cancellation = new SharedArrayBuffer(4);
          const worker = new Worker(backend==="platform"?"/engines/webcodecs-vp9/qualification.mjs":"/engines/webcodecs-vp9/isolated.mjs", { type: "module" });
          try {
            return await new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("Recovery job exceeded unchanged sixty-second private control deadline")), 60000);
              worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
              worker.onmessage = ({ data }) => { if (data.type !== "progress") { clearTimeout(timer); resolve(data); } };
              worker.postMessage({ file, output: handle, cancellation, nativeProfile: 10, implementation: backend==="platform"?"candidate":"automatic",
                ...(backend==="platform"?{}:{fallbackCore:"single-thread"}),
                ...(fault ? { qualificationFault: fault } : {}),
                video: { codec: "vp9", quality: "automatic", maxWidth: 320, bitRateBps: 600000, frameRateFps: 24 } });
            });
          } finally { worker.terminate(); }
        }, { name, fault: entry.fault,backend });
        await observer.through(Date.now()); observer.setPhase("recovery-validation");
        const peaks = observer.peaks([phase]); row.memory = { ...peaks,
          incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - blankBaseline.privateBytes) / 1048576 : null };
        const result = row.result;
        assert.equal(result.cleanupComplete, true); assert.ok(result.writeAttempts >= 1);
        if(backend==="platform")assertPlatformVp9Terminal(result);
        else {
          assert.equal(result.isolation.childrenStarted, 2); assert.equal(result.isolation.terminationRequests, 2);
          assert.equal(result.isolation.candidateTerminationRequestedBeforeFallback, true);
        }
        assert.equal(result.qualificationFaultTriggered, Boolean(entry.fault));
        assert.ok(result.metrics.peakPendingOperations <= 1); assert.ok(result.metrics.peakQueuedBytes <= 1048576);
        assert.ok(result.metrics.maxReadChunkBytes <= 262144); assert.ok(result.metrics.maxWriteChunkBytes <= 1048576);
        row.browserOutputBytes = await page.evaluate(async name => {
          const root = await navigator.storage.getDirectory(); return (await (await root.getFileHandle(name)).getFile()).size;
        }, name);
        if (entry.fault) {
          assert.equal(result.type, "error"); assert.equal(result.errorStage, "conversion");
          if (entry.fault === "cancel-after-write") assert.equal(result.errorName, "AbortError");
          assert.equal(row.browserOutputBytes, 0, "Aborted transactional stream must leave no partial media");
        } else {
          assert.equal(result.type, "complete"); assert.ok(row.browserOutputBytes > 0 && row.browserOutputBytes <= 2097152);
          exported = 0; destination = await open(output, "wx"); outputCreated = true;
          await page.evaluate(async name => {
            const root = await navigator.storage.getDirectory(), file = await (await root.getFileHandle(name)).getFile();
            for (let offset = 0; offset < file.size; offset += 65536)
              await window.__appendVp9RecoveryOutput(Array.from(new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer())));
          }, name);
          await destination.close(); destination = undefined; assert.equal(exported, row.browserOutputBytes);
          const hash = createHash("sha256"); for await (const bytes of createReadStream(output, { highWaterMark: 65536 })) hash.update(bytes);
          row.outputSha256 = hash.digest("hex"); assert.equal(row.outputSha256, initialOutputSha256);
          const outputProbe = JSON.parse((await run(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", output],
            { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout);
          row.validation = await validateSmallVp9Fidelity({ root, source, output, sourceProbe, outputProbe, ffmpeg, ffprobe, env, run });
          assert.equal(row.validation.passed, true, JSON.stringify(row.validation.failures));
        }
        assert.ok(row.memory.validSamples > 0 && row.memory.unavailableSamples === 0 &&
          row.memory.incrementalPrivateMiB !== null && row.memory.incrementalPrivateMiB <= 250, "Exact same-blank full-tree memory limit remains250MiB");
        row.passed = true;
      } finally {
        await destination?.close(); destination = undefined;
        if (outputCreated) { await unlink(output); row.outputRemoved = true; } else row.outputRemoved = true;
        await page.evaluate(async name => { const root = await navigator.storage.getDirectory();
          await root.removeEntry(name).catch(error => { if (error.name !== "NotFoundError") throw error; });
        }, name); row.opfsRemoved = true;
      }
      await pause(2000); row.afterCleanup = await sampleChromiumTree(chromePid);
      assert.ok(typeof row.afterCleanup.privateBytes === "number" && row.afterCleanup.privateBytes > 0, "Post-cleanup memory unavailable, not zero");
      row.cleanupDeltaFromLoadedMiB = (row.afterCleanup.privateBytes - loadedIdle.privateBytes) / 1048576;
      assert.ok(Number.isFinite(row.cleanupDeltaFromLoadedMiB) && row.cleanupDeltaFromLoadedMiB <= evidence.maximumCleanupDeltaMiB,
        "Post-job memory must return near the existing loaded baseline, not grow unchecked");
    }
    const peaks = observer.peaks(phases); evidence.memory = { ...peaks,
      incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - blankBaseline.privateBytes) / 1048576 : null };
    assert.equal(evidence.cases.length, 5); assert.equal(evidence.cases.filter(row => row.validation?.passed).length, 3);
    assert.ok(evidence.memory.incrementalPrivateMiB !== null && evidence.memory.incrementalPrivateMiB <= 250);
    evidence.passed = true;
  } finally {
    const peaks = observer.peaks(phases); evidence.memory = { ...peaks,
      incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - blankBaseline.privateBytes) / 1048576 : null };
    await destination?.close();
  }
}
