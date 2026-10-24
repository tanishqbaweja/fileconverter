// Observe the real application button/lifecycle. No alternate converter, worker,
// native helper, generated progress, or production I/O interception.
export async function runMpeg2UiJob(expectedOptions = null) {
  const phases = []; let nativeMetrics = null, observedRunning = false;
  const expectedBatchSize = expectedOptions?.batchSize ?? 1;
  if (![1, 2].includes(expectedBatchSize)) throw new Error("Only finite one/two-file UI qualification is allowed");
  expectedOptions = expectedOptions?.options ?? expectedOptions;
  const nativeBatchItems = new Map();
  const bridge = window.__WITHIN_TEST__;
  if (bridge?.getState().selectedProfileId !== "mkv-to-mp4-mpeg2") throw new Error("Private MPEG-2 profile is not selected");
  let selectedOptions = null;
  if (expectedOptions) {
    const value = id => document.querySelector(`[data-testid="${id}"]`)?.value;
    selectedOptions = { codec: value("video-codec-select"), maxWidth: Number(value("video-width-select")), bitRateBps: Number(value("video-bitrate-select")),
      frameRateFps: Number(value("video-frame-rate-select")), quality: value("video-quality-select") };
    if (JSON.stringify(selectedOptions) !== JSON.stringify(expectedOptions)) throw new Error("Actual form options differ from requested UI case");
  }
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
      if (current.phase === "Encoding MPEG-2 MP4" && current.metrics?.wasmMemoryBytes === 50331648 && current.metrics.outputBytes > 0) {
        nativeMetrics = { ...current.metrics };
        if (current.batchCompleted < 0 || current.batchCompleted >= expectedBatchSize) { clearTimeout(timeout); clearInterval(timer); reject(new Error("Unexpected native batch index")); return; }
        nativeBatchItems.set(current.batchCompleted, { index: current.batchCompleted, inputBytes: current.metrics.inputBytes,
          outputBytes: current.metrics.outputBytes, wasmMemoryBytes: current.metrics.wasmMemoryBytes });
      }
      if (observedRunning && ["complete", "cancelled", "error"].includes(current.jobState) && current.workerStatus === "ready") {
        clearTimeout(timeout); clearInterval(timer); resolve(current);
      }
    }, 16);
    button.click();
  });
  if (!observedRunning) throw new Error("UI never observed an active conversion");
  if (state.jobState !== "complete") throw new Error(state.error || "Actual UI conversion did not complete");
  if (!nativeMetrics) throw new Error("Actual UI native-work counters were not observed");
  if (state.batchOutputNames.length !== expectedBatchSize || state.batchTotal !== expectedBatchSize || state.batchCompleted !== expectedBatchSize || nativeBatchItems.size !== expectedBatchSize)
    throw new Error("Expected every real UI batch item to complete with observed native work");
  if (new Set(state.batchOutputNames.map(name => name.toLowerCase())).size !== expectedBatchSize) throw new Error("UI batch output names collide");
  const destinationName = state.batchOutputNames[0];
  const root = await navigator.storage.getDirectory();
  for (const name of state.batchOutputNames) if ((await (await root.getFileHandle(name)).getFile()).size <= 0) throw new Error("Actual UI output is empty");
  const stageNames = [];
  for await (const name of root.keys()) if (name.startsWith("within-stage-mkv-to-mp4-mpeg2-")) {
    if (stageNames.length === 8) throw new Error("Unexpected stage accumulation"); stageNames.push(name);
  }
  return { result: { type: state.jobState, metrics: state.metrics, phases, nativeMetrics,
    observationScope: "actual UI state, not fabricated raw worker messages; terminal metrics describe final batch item" }, stageNames, destinationName,
    destinationNames: state.batchOutputNames, nativeBatchItems: [...nativeBatchItems.values()],
    uiEvidence: { observedRunning, actualConvertButton: true, nativeWorkObserved: true,
      finalWorkerReady: state.workerStatus === "ready", destinationAdapter: "production directory output using isolated OPFS handle",
      nativeOsPickerCovered: false, selectedOptions, optionsReadFromActualForm: selectedOptions !== null,
      expectedBatchSize, completedBatchItems: state.batchCompleted,
      sourceDimensionsAndTimingOptionsOnly: !selectedOptions || (selectedOptions.maxWidth === 0 && selectedOptions.frameRateFps === 0 && selectedOptions.bitRateBps === 0 && selectedOptions.quality === "automatic") } };
}
