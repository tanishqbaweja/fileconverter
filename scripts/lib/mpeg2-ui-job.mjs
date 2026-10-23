// Observe the real application button/lifecycle. No alternate converter, worker,
// native helper, generated progress, or production I/O interception.
export async function runMpeg2UiJob() {
  const phases = []; let nativeMetrics = null, observedRunning = false;
  const bridge = window.__WITHIN_TEST__;
  if (bridge?.getState().selectedProfileId !== "mkv-to-mp4-mpeg2") throw new Error("Private MPEG-2 profile is not selected");
  const button = document.querySelector('[data-testid="convert-button"]');
  if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error("Actual Convert button is not enabled");
  const state = await new Promise((resolve, reject) => {
    let timer;
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error("Actual UI conversion exceeded60s")); }, 60000);
    timer = setInterval(() => {
      const current = bridge.getState();
      if (current.jobState === "running") observedRunning = true;
      if (current.phase && phases.at(-1) !== current.phase) {
        if (phases.length === 32) phases.shift(); phases.push(current.phase);
      }
      if (current.phase === "Encoding MPEG-2 MP4" && current.metrics?.wasmMemoryBytes === 50331648 && current.metrics.outputBytes > 0)
        nativeMetrics = { ...current.metrics };
      if (observedRunning && ["complete", "cancelled", "error"].includes(current.jobState) && current.workerStatus === "ready") {
        clearTimeout(timeout); clearInterval(timer); resolve(current);
      }
    }, 16);
    button.click();
  });
  if (!observedRunning) throw new Error("UI never observed an active conversion");
  if (state.jobState !== "complete") throw new Error(state.error || "Actual UI conversion did not complete");
  if (!nativeMetrics) throw new Error("Actual UI native-work counters were not observed");
  if (state.batchOutputNames.length !== 1) throw new Error("Expected exactly one real UI output");
  const destinationName = state.batchOutputNames[0];
  const root = await navigator.storage.getDirectory(), file = await (await root.getFileHandle(destinationName)).getFile();
  if (file.size <= 0) throw new Error("Actual UI output is empty");
  const stageNames = [];
  for await (const name of root.keys()) if (name.startsWith("within-stage-mkv-to-mp4-mpeg2-")) {
    if (stageNames.length === 8) throw new Error("Unexpected stage accumulation"); stageNames.push(name);
  }
  return { result: { type: state.jobState, metrics: state.metrics, phases, nativeMetrics,
    observationScope: "actual UI state, not fabricated raw worker messages" }, stageNames, destinationName,
    uiEvidence: { observedRunning, actualConvertButton: true, nativeWorkObserved: true,
      finalWorkerReady: state.workerStatus === "ready", destinationAdapter: "production directory output using isolated OPFS handle",
      nativeOsPickerCovered: false, sourceDimensionsAndTimingOptionsOnly: true } };
}
