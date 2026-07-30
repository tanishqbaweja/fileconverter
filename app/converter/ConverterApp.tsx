"use client";

import {
  conversionProfiles,
  detectFormat,
  formatById,
  publicProfilesFor,
  type ConversionProfile,
} from "../../lib/capability-registry";
import type {
  ConversionMetrics,
  WorkerRequest,
  WorkerResponse,
} from "../../lib/conversion-protocol";
import {
  type DragEvent,
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type JobState = "idle" | "running" | "complete" | "cancelled" | "error";

interface BrowserCapabilities {
  secure: boolean;
  wasm: boolean;
  workers: boolean;
  fileSystemAccess: boolean;
  opfs: boolean;
  compression: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webCodecs: boolean;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface TestBridge {
  getState: () => {
    jobState: JobState;
    phase: string;
    metrics: ConversionMetrics | null;
    error: string | null;
    warnings: string[];
    selectedProfileId: string | null;
    opfsName: string | null;
    workerStatus: "starting" | "ready" | "error";
  };
}

declare global {
  interface Window {
    __WITHIN_TEST__?: TestBridge;
  }
}

const EMPTY_METRICS: ConversionMetrics = {
  inputBytes: 0,
  outputBytes: 0,
  queuedBytes: 0,
  peakQueuedBytes: 0,
  pendingOperations: 0,
  peakPendingOperations: 0,
  maxReadChunkBytes: 0,
  maxWriteChunkBytes: 0,
  elapsedMs: 0,
  wasmMemoryBytes: 0,
  peakWasmMemoryBytes: 0,
  sharedArrayBufferBytes: 0,
  activeWorkerCount: 1,
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function outputName(file: File, profile: ConversionProfile): string {
  if (profile.id === "gzip-compress") return `${file.name}.gz`;
  if (profile.id === "gzip-decompress") {
    return file.name.replace(/\.(?:gz|gzip)$/i, "") || "decompressed-file";
  }
  const extension = formatById(profile.output)?.extensions[0] ?? "out";
  return `${file.name.replace(/\.[^.]+$/, "")}.${extension}`;
}

function outputPickerTypes(profile: ConversionProfile): FilePickerAcceptType[] {
  const format = formatById(profile.output);
  if (!format) return [];
  const extensions = format.extensions.map((extension) => `.${extension}`);
  const mime = format.mimeTypes[0] ?? "application/octet-stream";
  return [
    {
      description: format.label,
      accept: { [mime]: extensions.length ? extensions : [".bin"] },
    },
  ];
}

function capabilitySnapshot(): BrowserCapabilities {
  return {
    secure: window.isSecureContext,
    wasm: typeof WebAssembly === "object",
    workers: typeof Worker === "function",
    fileSystemAccess: typeof window.showSaveFilePicker === "function",
    opfs: typeof navigator.storage?.getDirectory === "function",
    compression:
      typeof CompressionStream === "function" &&
      typeof DecompressionStream === "function",
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
    crossOriginIsolated: window.crossOriginIsolated,
    webCodecs: typeof window.VideoEncoder === "function",
  };
}

export function ConverterApp() {
  const [file, setFile] = useState<File | null>(null);
  const [inputFormat, setInputFormat] = useState("binary");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [destinationHandle, setDestinationHandle] =
    useState<FileSystemFileHandle | null>(null);
  const [jobState, setJobState] = useState<JobState>("idle");
  const [phase, setPhase] = useState("Ready");
  const [metrics, setMetrics] = useState<ConversionMetrics | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [capabilities, setCapabilities] =
    useState<BrowserCapabilities | null>(null);
  const [jsHeap, setJsHeap] = useState<number | null>(null);
  const [peakJsHeap, setPeakJsHeap] = useState<number | null>(null);
  const [opfsName, setOpfsName] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [storageQuota, setStorageQuota] = useState<number | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState(
    "No app-owned temporary files detected.",
  );
  const [workerReady, setWorkerReady] = useState(false);
  const [workerFailed, setWorkerFailed] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const testMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("test") === "1";

  const profiles = useMemo(
    () => publicProfilesFor(inputFormat, testMode),
    [inputFormat, testMode],
  );
  const selectedProfile = useMemo(
    () => conversionProfiles.find((profile) => profile.id === profileId) ?? null,
    [profileId],
  );

  useEffect(() => {
    let disposed = false;
    let replacementTimer = 0;
    const capabilityFrame = window.requestAnimationFrame(() => {
      setCapabilities(capabilitySnapshot());
    });

    const replaceWorker = (retired: Worker) => {
      retired.terminate();
      if (workerRef.current === retired) workerRef.current = null;
      setWorkerReady(false);
      if (disposed) return;
      replacementTimer = window.setTimeout(() => {
        if (!disposed) installWorker();
      }, 250);
    };

    const installWorker = () => {
      const worker = new Worker(
        new URL("../../workers/conversion.worker.ts", import.meta.url),
        { name: "within-conversion" },
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === "ready") {
          setWorkerReady(true);
          setWorkerFailed(false);
          return;
        }
        if (message.jobId !== jobIdRef.current) return;
        if (message.type === "progress") {
          setPhase(message.phase);
          setMetrics(message.metrics);
        } else if (message.type === "warning") {
          setWarnings((current) => [...current.slice(-7), message.message]);
        } else if (message.type === "complete") {
          setMetrics(message.metrics);
          setOpfsName(message.opfsName ?? null);
          setPhase("Saved");
          setJobState("complete");
          replaceWorker(worker);
        } else if (message.type === "cancelled") {
          setMetrics(message.metrics);
          setPhase("Cancelled");
          setJobState("cancelled");
          replaceWorker(worker);
        } else {
          setMetrics(message.metrics);
          setError(message.message);
          setPhase("Stopped safely");
          setJobState("error");
          replaceWorker(worker);
        }
      };
      worker.onerror = (event) => {
        setWorkerFailed(true);
        const detail =
          event instanceof ErrorEvent && event.message
            ? event.message
            : "the browser blocked or rejected the worker script";
        setError(`Conversion worker failed to start: ${detail}.`);
        setPhase("Worker unavailable");
        setJobState("error");
      };
      worker.onmessageerror = () => {
        setWorkerFailed(true);
        setError("The conversion worker returned an unreadable message.");
        setPhase("Worker unavailable");
        setJobState("error");
      };
    };

    installWorker();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(capabilityFrame);
      window.clearTimeout(replacementTimer);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const refreshStorageEstimate = useCallback(async () => {
    const estimate = await navigator.storage?.estimate?.();
    setStorageUsage(estimate?.usage ?? null);
    setStorageQuota(estimate?.quota ?? null);
  }, []);

  const clearAppTemporaryStorage = useCallback(async () => {
    if (!navigator.storage?.getDirectory) return 0;
    const root = await navigator.storage.getDirectory();
    let removed = 0;
    for await (const [name] of root.entries()) {
      if (!name.startsWith("within-")) continue;
      await root.removeEntry(name, { recursive: true });
      removed += 1;
    }
    await refreshStorageEstimate();
    return removed;
  }, [refreshStorageEstimate]);

  useEffect(() => {
    if (testMode) return;
    void navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const cleanupTimer = window.setTimeout(() => {
      void clearAppTemporaryStorage()
        .then((removed) => {
          setCleanupMessage(
            removed
              ? `Removed ${removed} stale app-owned temporary ${removed === 1 ? "file" : "files"}.`
              : "No app-owned temporary files detected.",
          );
        })
        .catch(() => {
          setCleanupMessage("Temporary storage is unavailable in this browser.");
        });
    }, 0);
    return () => window.clearTimeout(cleanupTimer);
  }, [clearAppTemporaryStorage, testMode]);

  useEffect(() => {
    if (jobState !== "running") return;
    const sample = () => {
      const memory = (performance as PerformanceWithMemory).memory;
      if (!memory) return;
      setJsHeap(memory.usedJSHeapSize);
      setPeakJsHeap((current) =>
        Math.max(current ?? 0, memory.usedJSHeapSize),
      );
    };
    sample();
    const timer = window.setInterval(sample, 500);
    return () => window.clearInterval(timer);
  }, [jobState]);

  useEffect(() => {
    if (!testMode) return;
    window.__WITHIN_TEST__ = {
      getState: () => ({
        jobState,
        phase,
        metrics,
        error,
        warnings,
        selectedProfileId: profileId,
        opfsName,
        workerStatus: workerFailed ? "error" : workerReady ? "ready" : "starting",
      }),
    };
    return () => {
      delete window.__WITHIN_TEST__;
    };
  }, [
    error,
    jobState,
    metrics,
    opfsName,
    phase,
    profileId,
    testMode,
    warnings,
    workerFailed,
    workerReady,
  ]);

  const acceptFile = useCallback(
    (nextFile: File) => {
      if (jobState === "running") return;
      const detected = detectFormat(nextFile);
      const nextProfiles = publicProfilesFor(detected, testMode);
      setFile(nextFile);
      setInputFormat(detected);
      setProfileId(nextProfiles[0]?.id ?? null);
      setDestinationHandle(null);
      setJobState("idle");
      setPhase("Ready");
      setMetrics(null);
      setWarnings([]);
      setError(null);
      setJsHeap(null);
      setPeakJsHeap(null);
      setOpfsName(null);
    },
    [jobState, testMode],
  );

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile) acceptFile(nextFile);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) acceptFile(nextFile);
  };

  const chooseDestination = async () => {
    if (!file || !selectedProfile || !window.showSaveFilePicker) return;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: outputName(file, selectedProfile),
        types: outputPickerTypes(selectedProfile),
        excludeAcceptAllOption: false,
      });
      setDestinationHandle(handle);
      setError(null);
    } catch (pickerError) {
      if (
        !(pickerError instanceof DOMException) ||
        pickerError.name !== "AbortError"
      ) {
        setError(
          pickerError instanceof Error
            ? pickerError.message
            : "The destination could not be opened.",
        );
      }
    }
  };

  const startConversion = async () => {
    if (!file || !selectedProfile || !workerRef.current) return;
    let destination:
      | { mode: "handle"; handle: FileSystemFileHandle }
      | { mode: "opfs-test"; name: string };

    if (testMode) {
      destination = {
        mode: "opfs-test",
        name: `within-test-${selectedProfile.id}-${Date.now()}`,
      };
    } else {
      if (!destinationHandle) {
        setError("Choose where the converted file should be saved first.");
        return;
      }
      destination = { mode: "handle", handle: destinationHandle };
    }

    const jobId = crypto.randomUUID();
    jobIdRef.current = jobId;
    setJobState("running");
    setPhase("Opening destination");
    setMetrics({ ...EMPTY_METRICS });
    setWarnings([]);
    setError(null);
    setPeakJsHeap(null);
    setOpfsName(null);
    const request: WorkerRequest = {
      type: "start",
      jobId,
      profileId: selectedProfile.id,
      file,
      destination,
    };
    workerRef.current.postMessage(request);
  };

  const cancelConversion = () => {
    const jobId = jobIdRef.current;
    if (!jobId || !workerRef.current) return;
    const request: WorkerRequest = { type: "cancel", jobId };
    workerRef.current.postMessage(request);
    setPhase("Cancelling safely");
  };

  const clearFile = () => {
    if (jobState === "running") return;
    setFile(null);
    setInputFormat("binary");
    setProfileId(null);
    setDestinationHandle(null);
    setMetrics(null);
    setWarnings([]);
    setError(null);
    setPhase("Ready");
    setOpfsName(null);
    setJobState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const progress = file
    ? Math.min(100, ((metrics?.inputBytes ?? 0) / Math.max(1, file.size)) * 100)
    : 0;
  const throughput =
    metrics && metrics.elapsedMs > 0
      ? metrics.inputBytes / (metrics.elapsedMs / 1000)
      : 0;
  const featureReady =
    capabilities?.secure &&
    capabilities.wasm &&
    capabilities.workers &&
    workerReady &&
    (testMode || capabilities.fileSystemAccess);

  const capabilityItems: [string, boolean][] = capabilities
    ? [
        ["Private context", capabilities.secure],
        ["Direct save", capabilities.fileSystemAccess],
        ["Workers", capabilities.workers],
        ["Wasm", capabilities.wasm],
        ["OPFS fallback", capabilities.opfs],
        ["Cross-origin isolated", capabilities.crossOriginIsolated],
      ]
    : [];

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Within home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Within</span>
        </a>
        <nav aria-label="Page sections">
          <a href="#converter">Convert</a>
          <a href="#proof">How it stays private</a>
          <a href="#formats">Verified formats</a>
        </nav>
        <div className="privacy-chip">
          <span className="pulse-dot" aria-hidden="true" />
          Local only
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Private by architecture, not by promise</p>
          <h1>
            Big files.
            <br />
            <em>Small memory.</em>
          </h1>
          <p className="hero-lede">
            Convert directly from your file to the destination you choose.
            Nothing is uploaded, and no full-size copy waits in browser memory.
          </p>
          <div className="hero-notes" aria-label="Core guarantees">
            <span>0 bytes uploaded</span>
            <span>1 write in flight</span>
            <span>256 KiB write cap</span>
          </div>
        </div>

        <section className="converter-card" id="converter" aria-labelledby="convert-title">
          <div className="card-heading">
            <div>
              <p className="step-label">01 / Choose a file</p>
              <h2 id="convert-title">Convert on this device</h2>
            </div>
            <span className={`readiness ${featureReady ? "ready" : "limited"}`}>
              {featureReady ? "Ready" : "Check browser"}
            </span>
          </div>

          <div
            className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              data-testid="file-input"
              id="file-input"
              type="file"
              onChange={onFileInput}
              disabled={jobState === "running"}
            />
            {file ? (
              <div className="selected-file">
                <div className="file-glyph" aria-hidden="true">
                  {file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}
                </div>
                <div className="file-copy">
                  <strong>{file.name}</strong>
                  <span>
                    {formatById(inputFormat)?.label ?? "Unknown format"} ·{" "}
                    {formatBytes(file.size)}
                  </span>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={clearFile}
                  disabled={jobState === "running"}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label htmlFor="file-input">
                <span className="plus" aria-hidden="true">
                  +
                </span>
                <strong>Drop a file here</strong>
                <span>or choose one from your device</span>
              </label>
            )}
          </div>

          {file && profiles.length === 0 ? (
            <div className="honesty-note" role="status">
              <strong>This format is not publicly enabled yet.</strong>
              <span>
                Its engine remains hidden until real output and memory tests pass.
                Renaming the extension is never offered as a fallback.
              </span>
            </div>
          ) : null}

          {file && profiles.length > 0 ? (
            <>
              <div className="control-grid">
                <label>
                  <span>Convert to</span>
                  <select
                    data-testid="format-select"
                    value={profileId ?? ""}
                    onChange={(event) => {
                      setProfileId(event.target.value);
                      setDestinationHandle(null);
                      setJobState("idle");
                      setMetrics(null);
                      setError(null);
                    }}
                    disabled={jobState === "running"}
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {formatById(profile.output)?.label ?? profile.output}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="route-panel">
                  <span>Processing route</span>
                  <strong>
                    {selectedProfile?.route === "stream"
                      ? "Bounded stream"
                      : selectedProfile?.route === "stream-copy"
                        ? "Lossless stream copy"
                        : "Decode + re-encode"}
                  </strong>
                </div>
              </div>

              {!testMode ? (
                <button
                  className="destination-button"
                  type="button"
                  onClick={chooseDestination}
                  disabled={
                    jobState === "running" ||
                    !capabilities?.fileSystemAccess
                  }
                >
                  <span>
                    {destinationHandle
                      ? destinationHandle.name
                      : "Choose destination file"}
                  </span>
                  <span aria-hidden="true">Browse →</span>
                </button>
              ) : (
                <div className="test-mode-note">Test output uses isolated browser storage.</div>
              )}

              {selectedProfile &&
              (selectedProfile.metadataLimitations.length ||
                selectedProfile.fidelityLimitations.length) ? (
                <details className="limitations">
                  <summary>What this destination cannot preserve</summary>
                  <ul>
                    {[
                      ...selectedProfile.metadataLimitations,
                      ...selectedProfile.fidelityLimitations,
                    ].map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {metrics ? (
                <div className="progress-panel" aria-live="polite">
                  <div className="progress-topline">
                    <strong>{phase}</strong>
                    <span>{progress.toFixed(progress < 10 ? 1 : 0)}%</span>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <dl className="live-metrics">
                    <div>
                      <dt>Read</dt>
                      <dd>{formatBytes(metrics.inputBytes)}</dd>
                    </div>
                    <div>
                      <dt>Written</dt>
                      <dd>{formatBytes(metrics.outputBytes)}</dd>
                    </div>
                    <div>
                      <dt>Throughput</dt>
                      <dd>{formatBytes(throughput)}/s</dd>
                    </div>
                    <div>
                      <dt>Elapsed</dt>
                      <dd>{formatDuration(metrics.elapsedMs)}</dd>
                    </div>
                    <div>
                      <dt>Queued</dt>
                      <dd>{formatBytes(metrics.queuedBytes)}</dd>
                    </div>
                    <div>
                      <dt>Peak JS heap</dt>
                      <dd>{peakJsHeap == null ? "Unavailable" : formatBytes(peakJsHeap)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {warnings.map((warning) => (
                <p className="warning" key={warning}>
                  {warning}
                </p>
              ))}
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}

              {jobState === "running" ? (
                <button
                  className="convert-button cancel"
                  type="button"
                  onClick={cancelConversion}
                >
                  Cancel safely
                </button>
              ) : (
                <button
                  data-testid="convert-button"
                  className="convert-button"
                  type="button"
                  onClick={startConversion}
                  disabled={
                    !selectedProfile ||
                    (!testMode && !destinationHandle) ||
                    !featureReady
                  }
                >
                  {jobState === "complete" ? "Convert again" : "Start conversion"}
                  <span aria-hidden="true">↗</span>
                </button>
              )}
            </>
          ) : null}
        </section>
      </section>

      <section className="proof-section" id="proof">
        <div className="section-intro">
          <p className="eyebrow">The privacy proof</p>
          <h2>Your file takes the short route.</h2>
          <p>
            Browser APIs connect a bounded reader to a worker and then directly
            to the destination you approve. The hosting server only supplies the
            app itself.
          </p>
        </div>
        <ol className="data-flow">
          <li>
            <span>1</span>
            <div>
              <strong>Open locally</strong>
              <p>Read small chunks from the original browser File.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Process off-screen</strong>
              <p>A dedicated worker owns the active engine and its fixed buffers.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Write with backpressure</strong>
              <p>One awaited write at a time prevents an output queue from growing.</p>
            </div>
          </li>
        </ol>
        <div className="capability-strip">
          {capabilityItems.map(([label, available]) => (
            <span key={label} className={available ? "yes" : "no"}>
              <i aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
        <div className="storage-card">
          <div>
            <strong>App-owned temporary storage</strong>
            <p>
              {cleanupMessage} User-selected destination files are never included
              in this cleanup.
            </p>
            <small>
              {storageUsage == null
                ? "Browser storage usage unavailable"
                : `${formatBytes(storageUsage)} used${storageQuota == null ? "" : ` of ${formatBytes(storageQuota)}`}`}
            </small>
          </div>
          <button
            type="button"
            onClick={() => {
              setCleanupMessage("Checking app-owned temporary storage…");
              void clearAppTemporaryStorage()
                .then((removed) => {
                  setCleanupMessage(
                    removed
                      ? `Removed ${removed} app-owned temporary ${removed === 1 ? "file" : "files"}.`
                      : "No app-owned temporary files detected.",
                  );
                })
                .catch(() => {
                  setCleanupMessage(
                    "Temporary storage could not be cleared in this browser.",
                  );
                });
            }}
            disabled={jobState === "running" || !capabilities?.opfs}
          >
            Clear temporary storage
          </button>
        </div>
      </section>

      <section className="formats-section" id="formats">
        <div className="section-intro">
          <p className="eyebrow">Published from the test registry</p>
          <h2>Only verified routes appear.</h2>
          <p>
            Format buttons are generated from the same machine-readable records
            used by the tests. Media routes remain invisible until their custom
            engine passes output validation and the complete browser memory gate.
          </p>
        </div>
        <div className="matrix">
          {conversionProfiles
            .filter(
              (profile) =>
                profile.public && profile.automatedTestStatus === "passed",
            )
            .map((profile) => (
              <article key={profile.id}>
                <span>{formatById(profile.input)?.label}</span>
                <b aria-hidden="true">→</b>
                <span>{formatById(profile.output)?.label}</span>
                <small>{profile.route}</small>
              </article>
            ))}
          {!conversionProfiles.some(
            (profile) =>
              profile.public && profile.automatedTestStatus === "passed",
          ) ? (
            <div className="matrix-empty">
              Verification is running. No untested conversion is being advertised.
            </div>
          ) : null}
        </div>
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Within</span>
        </div>
        <p>No accounts. No analytics. No file or filename telemetry. No PDFs.</p>
        <span className="footer-memory">
          Current page JS heap: {jsHeap == null ? "unavailable" : formatBytes(jsHeap)}
        </span>
      </footer>
    </main>
  );
}
