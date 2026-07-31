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
  TestFault,
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
  directoryAccess: boolean;
  opfs: boolean;
  compression: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webCodecs: boolean;
  imageDecoder: boolean;
  offscreenCanvas: boolean;
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
    opfsNames: string[];
    batchOutputNames: string[];
    batchCompleted: number;
    batchTotal: number;
    startupCleanupComplete: boolean;
    workerStatus: "starting" | "ready" | "error";
  };
}

interface ActiveBatch {
  files: File[];
  profile: ConversionProfile;
  outputNames: string[];
  destinationHandle: FileSystemFileHandle | null;
  destinationDirectoryHandle: FileSystemDirectoryHandle | null;
  testMode: boolean;
  testDirectoryMode: boolean;
  testFault?: TestFault;
  runId: string;
  index: number;
  opfsNames: string[];
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

const TEST_FAULTS = new Set<TestFault>([
  "write",
  "quota",
  "permission",
  "worker-crash",
]);

async function removeAppOwnedOpfsEntry(name: string | null): Promise<void> {
  if (!name?.startsWith("within-test-")) return;
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(name).catch(() => {});
}

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
  if (profile.id === "tar-gz-to-tar") {
    return (
      file.name.replace(/(?:\.tar\.gz|\.tgz)$/i, ".tar") ||
      "decompressed-archive.tar"
    );
  }
  const extension = formatById(profile.output)?.extensions[0] ?? "out";
  return `${file.name.replace(/\.[^.]+$/, "")}.${extension}`;
}

function numberedOutputName(name: string, number: number): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)}-${number}${name.slice(dot)}`
    : `${name}-${number}`;
}

function batchOutputNames(
  files: readonly File[],
  profile: ConversionProfile,
): string[] {
  const used = new Set<string>();
  return files.map((file) => {
    const initial = outputName(file, profile);
    let candidate = initial;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = numberedOutputName(initial, suffix);
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

async function unusedFileHandle(
  directory: FileSystemDirectoryHandle,
  initialName: string,
): Promise<{ handle: FileSystemFileHandle; name: string }> {
  let candidate = initialName;
  let suffix = 2;
  for (;;) {
    try {
      await directory.getFileHandle(candidate);
      candidate = numberedOutputName(initialName, suffix);
      suffix += 1;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
      return {
        handle: await directory.getFileHandle(candidate, { create: true }),
        name: candidate,
      };
    }
  }
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

async function destinationMatchesSource(
  handle: FileSystemFileHandle,
  source: File,
): Promise<boolean> {
  const existing = await handle.getFile();
  return (
    existing.name === source.name &&
    existing.size === source.size &&
    existing.lastModified === source.lastModified
  );
}

function capabilitySnapshot(): BrowserCapabilities {
  return {
    secure: window.isSecureContext,
    wasm: typeof WebAssembly === "object",
    workers: typeof Worker === "function",
    fileSystemAccess: typeof window.showSaveFilePicker === "function",
    directoryAccess: typeof window.showDirectoryPicker === "function",
    opfs: typeof navigator.storage?.getDirectory === "function",
    compression:
      typeof CompressionStream === "function" &&
      typeof DecompressionStream === "function",
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
    crossOriginIsolated: window.crossOriginIsolated,
    webCodecs: typeof window.VideoEncoder === "function",
    imageDecoder: typeof window.ImageDecoder === "function",
    offscreenCanvas: typeof window.OffscreenCanvas === "function",
  };
}

export function ConverterApp() {
  const [file, setFile] = useState<File | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [inputFormat, setInputFormat] = useState("binary");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [destinationHandle, setDestinationHandle] =
    useState<FileSystemFileHandle | null>(null);
  const [destinationDirectoryHandle, setDestinationDirectoryHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
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
  const [opfsNames, setOpfsNames] = useState<string[]>([]);
  const [completedBatchOutputNames, setCompletedBatchOutputNames] = useState<
    string[]
  >([]);
  const [batchCompleted, setBatchCompleted] = useState(0);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [storageQuota, setStorageQuota] = useState<number | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState(
    "No app-owned temporary files detected.",
  );
  const [startupCleanupComplete, setStartupCleanupComplete] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [workerFailed, setWorkerFailed] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const activeOpfsNameRef = useRef<string | null>(null);
  const activeBatchRef = useRef<ActiveBatch | null>(null);
  const beginBatchItemRef = useRef<
    ((worker: Worker, batch: ActiveBatch, index: number) => Promise<void>) | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const testMode =
    typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "[::1]") &&
    new URLSearchParams(window.location.search).get("test") === "1";
  const requestedTestFault =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("fault");
  const testFault =
    testMode && TEST_FAULTS.has(requestedTestFault as TestFault)
      ? (requestedTestFault as TestFault)
      : undefined;
  const testDirectoryMode =
    testMode &&
    new URLSearchParams(window.location.search).get("directory") === "1";
  const testCleanupMode =
    testMode &&
    new URLSearchParams(window.location.search).get("cleanup") === "1";

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

    const beginBatchItem = async (
      worker: Worker,
      batch: ActiveBatch,
      index: number,
    ) => {
      const nextFile = batch.files[index];
      if (!nextFile) throw new Error("The next batch file is unavailable.");
      batch.index = index;
      setFile(nextFile);
      setBatchCompleted(index);
      setJobState("running");
      setPhase(
        batch.files.length > 1
          ? `Opening destination ${index + 1} of ${batch.files.length}`
          : "Opening destination",
      );
      setMetrics({ ...EMPTY_METRICS });
      setError(null);
      setPeakJsHeap(null);
      setOpfsName(null);

      let destination:
        | { mode: "handle"; handle: FileSystemFileHandle }
        | { mode: "opfs-test"; name: string };
      if (batch.testMode && !batch.testDirectoryMode) {
        destination = {
          mode: "opfs-test",
          name: `within-test-${batch.profile.id}-${batch.runId}-${index + 1}`,
        };
        activeOpfsNameRef.current = destination.name;
      } else if (batch.files.length === 1 && batch.destinationHandle) {
        destination = { mode: "handle", handle: batch.destinationHandle };
        activeOpfsNameRef.current = null;
      } else if (batch.destinationDirectoryHandle) {
        const available = await unusedFileHandle(
          batch.destinationDirectoryHandle,
          batch.outputNames[index],
        );
        batch.outputNames[index] = available.name;
        destination = { mode: "handle", handle: available.handle };
        activeOpfsNameRef.current = null;
      } else {
        throw new Error("Choose a destination folder for this batch first.");
      }

      const jobId = crypto.randomUUID();
      jobIdRef.current = jobId;
      const request: WorkerRequest = {
        type: "start",
        jobId,
        profileId: batch.profile.id,
        file: nextFile,
        destination,
        testFault: batch.testFault,
      };
      worker.postMessage(request);
    };
    beginBatchItemRef.current = beginBatchItem;

    const replaceWorker = (
      retired: Worker,
      abandonedOpfsName: string | null = null,
    ) => {
      retired.terminate();
      if (workerRef.current === retired) workerRef.current = null;
      setWorkerReady(false);
      const restart = () => {
        if (disposed) return;
        replacementTimer = window.setTimeout(() => {
          if (!disposed) installWorker();
        }, 250);
      };
      if (abandonedOpfsName) {
        void removeAppOwnedOpfsEntry(abandonedOpfsName).finally(restart);
      } else {
        restart();
      }
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
          const batch = activeBatchRef.current;
          const warning =
            batch && batch.files.length > 1
              ? `${batch.files[batch.index]?.name ?? `File ${batch.index + 1}`}: ${message.message}`
              : message.message;
          setWarnings((current) => [...current.slice(-7), warning]);
        } else if (message.type === "complete") {
          const batch = activeBatchRef.current;
          activeOpfsNameRef.current = null;
          jobIdRef.current = null;
          setMetrics(message.metrics);
          if (batch) {
            if (message.opfsName) batch.opfsNames.push(message.opfsName);
            setOpfsNames([...batch.opfsNames]);
            const nextIndex = batch.index + 1;
            if (nextIndex < batch.files.length) {
              setBatchCompleted(nextIndex);
              setPhase(`Saved ${nextIndex} of ${batch.files.length}`);
              void beginBatchItem(worker, batch, nextIndex).catch((error) => {
                const staleOpfsName = activeOpfsNameRef.current;
                activeBatchRef.current = null;
                activeOpfsNameRef.current = null;
                jobIdRef.current = null;
                setError(error instanceof Error ? error.message : String(error));
                setPhase("Batch stopped safely");
                setJobState("error");
                replaceWorker(worker, staleOpfsName);
              });
              return;
            }
            activeBatchRef.current = null;
            setBatchCompleted(batch.files.length);
            setCompletedBatchOutputNames([...batch.outputNames]);
            setOpfsName(
              batch.files.length === 1 ? (message.opfsName ?? null) : null,
            );
            setPhase(
              batch.files.length === 1
                ? "Saved"
                : `Saved ${batch.files.length} files`,
            );
            setJobState("complete");
            replaceWorker(worker);
          } else {
            setOpfsName(message.opfsName ?? null);
            setPhase("Saved");
            setJobState("complete");
            replaceWorker(worker);
          }
        } else if (message.type === "cancelled") {
          const batch = activeBatchRef.current;
          activeBatchRef.current = null;
          activeOpfsNameRef.current = null;
          jobIdRef.current = null;
          setMetrics(message.metrics);
          setPhase(
            batch && batch.files.length > 1
              ? `Cancelled after ${batch.index} of ${batch.files.length} files`
              : "Cancelled",
          );
          setJobState("cancelled");
          replaceWorker(worker);
        } else {
          activeBatchRef.current = null;
          activeOpfsNameRef.current = null;
          jobIdRef.current = null;
          setMetrics(message.metrics);
          setError(message.message);
          setPhase("Stopped safely");
          setJobState("error");
          replaceWorker(worker);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const failedDuringConversion = jobIdRef.current !== null;
        const staleOpfsName = activeOpfsNameRef.current;
        activeBatchRef.current = null;
        activeOpfsNameRef.current = null;
        jobIdRef.current = null;
        setWorkerFailed(true);
        const detail =
          event instanceof ErrorEvent && event.message
            ? event.message
            : "the browser blocked or rejected the worker script";
        setError(
          failedDuringConversion
            ? `Conversion worker failed: ${detail}.`
            : `Conversion worker failed to start: ${detail}.`,
        );
        setPhase("Worker unavailable");
        setJobState("error");
        replaceWorker(worker, staleOpfsName);
      };
      worker.onmessageerror = () => {
        const staleOpfsName = activeOpfsNameRef.current;
        activeBatchRef.current = null;
        activeOpfsNameRef.current = null;
        jobIdRef.current = null;
        setWorkerFailed(true);
        setError("The conversion worker returned an unreadable message.");
        setPhase("Worker unavailable");
        setJobState("error");
        replaceWorker(worker, staleOpfsName);
      };
    };

    installWorker();
    return () => {
      disposed = true;
      beginBatchItemRef.current = null;
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
    if (testMode && !testCleanupMode) {
      const skippedCleanupTimer = window.setTimeout(
        () => setStartupCleanupComplete(true),
        0,
      );
      return () => window.clearTimeout(skippedCleanupTimer);
    }
    if (!testMode) {
      void navigator.serviceWorker?.register("/sw.js").catch(() => {});
    }
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
        })
        .finally(() => setStartupCleanupComplete(true));
    }, 0);
    return () => window.clearTimeout(cleanupTimer);
  }, [clearAppTemporaryStorage, testCleanupMode, testMode]);

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
        opfsNames,
        batchOutputNames: completedBatchOutputNames,
        batchCompleted,
        batchTotal: batchFiles.length,
        startupCleanupComplete,
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
    opfsNames,
    completedBatchOutputNames,
    phase,
    profileId,
    batchCompleted,
    batchFiles.length,
    startupCleanupComplete,
    testMode,
    warnings,
    workerFailed,
    workerReady,
  ]);

  const acceptFiles = useCallback(
    (nextFiles: File[]) => {
      if (jobState === "running") return;
      const nextFile = nextFiles[0];
      if (!nextFile) return;
      const detected = detectFormat(nextFile);
      const mismatched = nextFiles.find(
        (candidate) => detectFormat(candidate) !== detected,
      );
      if (mismatched) {
        setFile(null);
        setBatchFiles([]);
        setInputFormat("binary");
        setProfileId(null);
        setDestinationHandle(null);
        setDestinationDirectoryHandle(null);
        setJobState("idle");
        setMetrics(null);
        setWarnings([]);
        setOpfsName(null);
        setOpfsNames([]);
        setCompletedBatchOutputNames([]);
        setBatchCompleted(0);
        setError(
          `Batch files must share one detected format. ${mismatched.name} does not match ${nextFile.name}.`,
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const nextProfiles = publicProfilesFor(detected, testMode);
      setFile(nextFile);
      setBatchFiles(nextFiles);
      setInputFormat(detected);
      setProfileId(nextProfiles[0]?.id ?? null);
      setDestinationHandle(null);
      setDestinationDirectoryHandle(null);
      setJobState("idle");
      setPhase("Ready");
      setMetrics(null);
      setWarnings([]);
      setError(null);
      setJsHeap(null);
      setPeakJsHeap(null);
      setOpfsName(null);
      setOpfsNames([]);
      setCompletedBatchOutputNames([]);
      setBatchCompleted(0);
    },
    [jobState, testMode],
  );

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    if (nextFiles.length) acceptFiles(nextFiles);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const nextFiles = Array.from(event.dataTransfer.files ?? []);
    if (nextFiles.length) acceptFiles(nextFiles);
  };

  const chooseDestination = async () => {
    if (!file || !selectedProfile) return;
    try {
      if (batchFiles.length > 1) {
        if (!window.showDirectoryPicker) return;
        const directory = await window.showDirectoryPicker({
          id: "within-batch-output",
          mode: "readwrite",
        });
        setDestinationDirectoryHandle(directory);
        setDestinationHandle(null);
        setError(null);
        return;
      }
      if (!window.showSaveFilePicker) return;
      const handle = await window.showSaveFilePicker({
        suggestedName: outputName(file, selectedProfile),
        types: outputPickerTypes(selectedProfile),
        excludeAcceptAllOption: false,
      });
      if (await destinationMatchesSource(handle, file)) {
        setDestinationHandle(null);
        setError(
          "Choose a different destination name or folder. The source file cannot also be the output.",
        );
        return;
      }
      setDestinationHandle(handle);
      setDestinationDirectoryHandle(null);
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
    const worker = workerRef.current;
    if (!file || !selectedProfile || !worker || !beginBatchItemRef.current) return;
    const files = batchFiles.length ? batchFiles : [file];

    if (!testMode) {
      if (files.length > 1 && !destinationDirectoryHandle) {
        setError("Choose a destination folder for this batch first.");
        return;
      }
      if (files.length === 1 && !destinationHandle) {
        setError("Choose where the converted file should be saved first.");
        return;
      }
      if (files.length === 1 && destinationHandle) {
        try {
          if (await destinationMatchesSource(destinationHandle, file)) {
            setDestinationHandle(null);
            setError(
              "The destination now matches the source file. Choose a different destination before converting.",
            );
            return;
          }
        } catch (destinationError) {
          setError(
            destinationError instanceof Error
              ? `The destination is no longer accessible: ${destinationError.message}`
              : "The destination is no longer accessible.",
          );
          return;
        }
      }
    }

    const batch: ActiveBatch = {
      files,
      profile: selectedProfile,
      outputNames: batchOutputNames(files, selectedProfile),
      destinationHandle,
      destinationDirectoryHandle: testDirectoryMode
        ? await navigator.storage.getDirectory()
        : destinationDirectoryHandle,
      testMode,
      testDirectoryMode,
      testFault,
      runId: `${Date.now()}-${crypto.randomUUID()}`,
      index: 0,
      opfsNames: [],
    };
    activeBatchRef.current = batch;
    setWarnings([]);
    setOpfsNames([]);
    setCompletedBatchOutputNames([...batch.outputNames]);
    setBatchCompleted(0);
    try {
      await beginBatchItemRef.current(worker, batch, 0);
    } catch (startError) {
      activeBatchRef.current = null;
      activeOpfsNameRef.current = null;
      jobIdRef.current = null;
      setError(startError instanceof Error ? startError.message : String(startError));
      setPhase("Batch stopped safely");
      setJobState("error");
    }
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
    setBatchFiles([]);
    setInputFormat("binary");
    setProfileId(null);
    setDestinationHandle(null);
    setDestinationDirectoryHandle(null);
    setMetrics(null);
    setWarnings([]);
    setError(null);
    setPhase("Ready");
    setOpfsName(null);
    setOpfsNames([]);
    setCompletedBatchOutputNames([]);
    setBatchCompleted(0);
    setJobState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const currentFileProgress = file
    ? Math.min(100, ((metrics?.inputBytes ?? 0) / Math.max(1, file.size)) * 100)
    : 0;
  const progress =
    batchFiles.length > 1
      ? Math.min(
          100,
          ((batchCompleted + currentFileProgress / 100) / batchFiles.length) *
            100,
        )
      : currentFileProgress;
  const totalInputBytes = batchFiles.reduce(
    (total, candidate) => total + candidate.size,
    0,
  );
  const throughput =
    metrics && metrics.elapsedMs > 0
      ? metrics.inputBytes / (metrics.elapsedMs / 1000)
      : 0;
  const estimatedRemainingMs =
    file &&
    metrics &&
    throughput > 0 &&
    metrics.inputBytes < file.size
      ? ((file.size - metrics.inputBytes) / throughput) * 1000
      : jobState === "complete"
        ? 0
        : null;
  const mediaProfile =
    selectedProfile?.engine === "ffmpeg-remux" ||
    selectedProfile?.engine === "ffmpeg-audio" ||
    selectedProfile?.engine === "ffmpeg-video";
  const compressionProfile =
    selectedProfile?.engine === "compression-stream";
  const imageProfile = selectedProfile?.engine === "image-browser";
  const featureReady =
    capabilities?.secure &&
    capabilities.workers &&
    workerReady &&
    (!mediaProfile ||
      (capabilities.wasm &&
        capabilities.sharedArrayBuffer &&
        capabilities.crossOriginIsolated)) &&
    (!compressionProfile || capabilities.compression) &&
    (!imageProfile ||
      (capabilities.imageDecoder && capabilities.offscreenCanvas)) &&
    (testMode ||
      (batchFiles.length > 1
        ? capabilities.directoryAccess
        : capabilities.fileSystemAccess));

  const capabilityItems: [string, boolean][] = capabilities
    ? [
        ["Private context", capabilities.secure],
        [
          "Direct save",
          batchFiles.length > 1
            ? capabilities.directoryAccess
            : capabilities.fileSystemAccess,
        ],
        ["Workers", capabilities.workers],
        ["Wasm", capabilities.wasm],
        ["Shared buffers", capabilities.sharedArrayBuffer],
        [
          "Image codecs",
          capabilities.imageDecoder && capabilities.offscreenCanvas,
        ],
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
            <span>Bounded write cap</span>
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
              multiple
              onChange={onFileInput}
              disabled={jobState === "running"}
            />
            {file ? (
              <div className="selected-file">
                <div className="file-glyph" aria-hidden="true">
                  {batchFiles.length > 1
                    ? "BATCH"
                    : file.name.split(".").pop()?.slice(0, 4).toUpperCase() ||
                      "FILE"}
                </div>
                <div className="file-copy">
                  <strong>
                    {file.name}
                    {batchFiles.length > 1
                      ? ` + ${batchFiles.length - 1} more`
                      : ""}
                  </strong>
                  <span>
                    {formatById(inputFormat)?.label ?? "Unknown format"} ·{" "}
                    {formatBytes(
                      batchFiles.length > 1 ? totalInputBytes : file.size,
                    )}
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
                <strong>Drop files here</strong>
                <span>or choose one or more matching files from your device</span>
              </label>
            )}
          </div>

          {error && !file ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}

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
                      setDestinationDirectoryHandle(null);
                      setJobState("idle");
                      setMetrics(null);
                      setError(null);
                      setOpfsName(null);
                      setOpfsNames([]);
                      setCompletedBatchOutputNames([]);
                      setBatchCompleted(0);
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
                    !(batchFiles.length > 1
                      ? capabilities?.directoryAccess
                      : capabilities?.fileSystemAccess)
                  }
                >
                  <span>
                    {batchFiles.length > 1
                      ? destinationDirectoryHandle
                        ? destinationDirectoryHandle.name
                        : "Choose destination folder"
                      : destinationHandle
                        ? destinationHandle.name
                        : "Choose destination file"}
                  </span>
                  <span aria-hidden="true">Browse →</span>
                </button>
              ) : (
                <div className="test-mode-note">
                  Test output uses isolated browser storage
                  {batchFiles.length > 1
                    ? ` for ${batchFiles.length} sequential files.`
                    : "."}
                </div>
              )}

              {selectedProfile ? (
                <div className="profile-evidence">
                  {selectedProfile.automatedTestStatus === "passed" &&
                  selectedProfile.maxTestedBytes != null
                    ? `Correctness and complete-browser memory tested through ${formatBytes(selectedProfile.maxTestedBytes)}.`
                    : "Test-only route: correctness and complete-browser memory evidence is still pending."}
                </div>
              ) : null}

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
                      <dt>Estimated remaining</dt>
                      <dd>
                        {estimatedRemainingMs == null
                          ? "Calculating"
                          : formatDuration(estimatedRemainingMs)}
                      </dd>
                    </div>
                    <div>
                      <dt>Active engine</dt>
                      <dd>{selectedProfile?.engine ?? "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Queued</dt>
                      <dd>{formatBytes(metrics.queuedBytes)}</dd>
                    </div>
                    <div>
                      <dt>Peak Wasm</dt>
                      <dd>
                        {metrics.peakWasmMemoryBytes
                          ? formatBytes(metrics.peakWasmMemoryBytes)
                          : "Not used"}
                      </dd>
                    </div>
                    <div>
                      <dt>Conversion workers</dt>
                      <dd>{metrics.activeWorkerCount ?? "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Peak JS heap</dt>
                      <dd>{peakJsHeap == null ? "Unavailable" : formatBytes(peakJsHeap)}</dd>
                    </div>
                    <div>
                      <dt>Incremental private</dt>
                      <dd>Profiler only</dd>
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
                    (!testMode &&
                      (batchFiles.length > 1
                        ? !destinationDirectoryHandle
                        : !destinationHandle)) ||
                    !featureReady
                  }
                >
                  {jobState === "complete"
                    ? batchFiles.length > 1
                      ? "Convert batch again"
                      : "Convert again"
                    : batchFiles.length > 1
                      ? `Convert ${batchFiles.length} files`
                      : "Start conversion"}
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
                <small>
                  {profile.route} · tested to{" "}
                  {profile.maxTestedBytes == null
                    ? "pending"
                    : formatBytes(profile.maxTestedBytes)}
                </small>
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
        <p>
          No accounts. No analytics. No file or filename telemetry. No PDFs.{" "}
          <a href="/THIRD_PARTY_NOTICES.txt">Codec notices</a>.
        </p>
        <span className="footer-memory">
          Current page JS heap: {jsHeap == null ? "unavailable" : formatBytes(jsHeap)}
        </span>
      </footer>
    </main>
  );
}
