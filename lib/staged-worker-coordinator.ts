import type { StartConversionMessage, WorkerRequest, WorkerResponse } from "./conversion-protocol";
import { validateStagedCopyHandoff, type StagedJobIdentity, type StagedSaveRequest } from "./staged-copy-protocol";
import { isVpxDecoderProfile } from "./vpx-decoder-policy";
import { validateVpxCompiledCore, type VpxCompiledCore, type VpxCompiledCoreSlot } from "./vpx-compiled-core";
import { validateMpeg2CompiledCore, type Mpeg2CompiledCore, type Mpeg2CompiledCoreSlot } from "./mpeg2-compiled-core";
import { MPEG2_JOB_PROFILE } from "./mpeg2-stage-policy";

/** A bounded lifecycle owner, not a conversion engine or memory-measurement API. */
export class StagedWorkerCoordinator extends EventTarget implements Worker {
  onmessage: Worker["onmessage"] = null;
  onmessageerror: Worker["onmessageerror"] = null;
  onerror: Worker["onerror"] = null;
  private active: Worker | null = null;
  private role: "conversion" | "save" = "conversion";
  private ready = false;
  private disposed = false;
  private job: StagedJobIdentity | null = null;
  private pending: StartConversionMessage | StagedSaveRequest | null = null;
  private pendingCancel = false;
  private vpxCompiledCore: VpxCompiledCore | null = null;
  private vpxPreparedJobId: string | null = null;
  private mpeg2CompiledCore: Mpeg2CompiledCore | null = null;
  private mpeg2PreparedJobId: string | null = null;
  private navigationSuspended = false;
  private readonly onPageHide = (): void => {
    // Never interrupt an encoder, queued start or final destination copy. Idle
    // coordinators otherwise survive with the page in the browser's BFCache.
    if (this.disposed || this.navigationSuspended || this.job || this.pending) return;
    this.navigationSuspended = true; this.stopActive();
    this.vpxCompiledCore = null; this.vpxPreparedJobId = null; this.staticCodeSlot?.clear();
    this.mpeg2CompiledCore = null; this.mpeg2PreparedJobId = null; this.mpeg2CodeSlot?.clear();
  };
  private readonly onPageShow = (event: Event): void => {
    if (!(event as PageTransitionEvent).persisted || !this.navigationSuspended || this.disposed) return;
    this.navigationSuspended = false;
    try { this.install("conversion"); } catch (error) { this.fail(error); }
  };

  constructor(private readonly conversionFactory: () => Worker, private readonly saveFactory: () => Worker,
    private readonly staticCodeSlot?: VpxCompiledCoreSlot, private readonly mpeg2CodeSlot?: Mpeg2CompiledCoreSlot,
    private readonly lifecycleTarget: EventTarget | null = typeof window === "undefined" ? null : window) {
    super(); this.install("conversion");
    this.lifecycleTarget?.addEventListener("pagehide", this.onPageHide);
    this.lifecycleTarget?.addEventListener("pageshow", this.onPageShow);
  }
  private emit(message: WorkerResponse): void {
    const event = new MessageEvent("message", { data: message });
    this.dispatchEvent(event); this.onmessage?.call(this, event);
  }
  private stopActive(): void {
    const worker = this.active; this.active = null; this.ready = false;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
  }
  private fail(error: unknown): void {
    this.vpxCompiledCore = null; this.vpxPreparedJobId = null;
    this.staticCodeSlot?.clear();
    this.mpeg2CompiledCore = null; this.mpeg2PreparedJobId = null; this.mpeg2CodeSlot?.clear();
    this.pending = null; this.pendingCancel = false; this.job = null; this.stopActive();
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 512);
    const event = new ErrorEvent("error", { message, cancelable: true });
    this.dispatchEvent(event); this.onerror?.call(this, event);
  }
  private install(role: "conversion" | "save"): void {
    if (this.disposed) return;
    this.role = role; this.ready = false;
    const worker = role === "conversion" ? this.conversionFactory() : this.saveFactory(); this.active = worker;
    worker.onmessage = event => {
      if (this.disposed || this.active !== worker) return;
      const value = event.data;
      try {
        if (value?.type === "ready") {
          if (this.ready) throw new Error("Duplicate worker readiness");
          this.ready = true;
          const request = this.pending, cancel = this.pendingCancel; this.pending = null; this.pendingCancel = false;
          if (role === "conversion") this.emit({ type: "ready" });
          if (request && this.active === worker && !this.disposed) {
            worker.postMessage(request);
            if (cancel) worker.postMessage({ type: "cancel", jobId: request.jobId });
          }
          return;
        }
        if (value?.type === "staged-copy-handoff") {
          if (role !== "conversion" || !this.job || this.pending) throw new Error("Unexpected stage handoff");
          const request = validateStagedCopyHandoff(value, this.job, performance.timeOrigin + performance.now());
          // The codec has closed its native session and disk stage. Never retain
          // its worker, File, heaps or closures across the subsequent copy.
          this.stopActive(); this.pending = request; this.install("save"); return;
        }
        if (value?.type === "vpx-compiled-core") {
          if (role !== "conversion" || !this.job || !isVpxDecoderProfile(this.job.profileId) || value.jobId !== this.job.jobId ||
              this.vpxPreparedJobId === value.jobId || Object.keys(value).sort().join(",") !== "core,jobId,type")
            throw new Error("Unexpected static VPX code handoff");
          this.vpxCompiledCore = validateVpxCompiledCore(value.core); this.vpxPreparedJobId = value.jobId;
          this.staticCodeSlot?.set(this.vpxCompiledCore);
          return; // Never forward static code to the UI, saver, logs or results.
        }
        if (value?.type === "mpeg2-compiled-core") {
          if (role !== "conversion" || !this.job || this.job.profileId !== MPEG2_JOB_PROFILE || value.jobId !== this.job.jobId ||
              this.mpeg2PreparedJobId === value.jobId || Object.keys(value).sort().join(",") !== "core,jobId,type")
            throw new Error("Unexpected static MPEG-2 code handoff");
          this.mpeg2CompiledCore = validateMpeg2CompiledCore(value.core); this.mpeg2PreparedJobId = value.jobId;
          this.mpeg2CodeSlot?.set(this.mpeg2CompiledCore); return;
        }
        if (!this.job || value?.jobId !== this.job.jobId) return;
        if (!["progress", "warning", "complete", "cancelled", "error"].includes(value.type)) throw new Error("Unexpected worker response");
        if (["complete", "cancelled", "error"].includes(value.type)) this.job = null;
        this.emit(value as WorkerResponse);
      } catch (error) { this.fail(error); }
    };
    worker.onerror = event => { if (this.active === worker && !this.disposed) { event.preventDefault(); this.fail(event.message || "Conversion worker failed"); } };
    worker.onmessageerror = () => { if (this.active === worker && !this.disposed) this.fail(new Error("Unreadable worker response")); };
  }

  postMessage(message: WorkerRequest, transferOrOptions: Transferable[] | StructuredSerializeOptions = []): void {
    if (this.disposed) throw new Error("Conversion lifecycle owner is closed");
    const transfers = Array.isArray(transferOrOptions) ? transferOrOptions : transferOrOptions.transfer;
    if (transfers?.length) throw new Error("Conversion lifecycle messages do not transfer byte buffers");
    if (message.type === "cancel") {
      if (message.jobId !== this.job?.jobId) return;
      if (this.pending) this.pendingCancel = true; else this.active?.postMessage(message);
      return;
    }
    if (message.type !== "start" || this.job || this.pending) throw new Error("Only one conversion may be active");
    if ("vpxCompiledCore" in message || "mpeg2CompiledCore" in message) throw new Error("Static codec code is owned by the coordinator, not its caller");
    // A caller may resume before a synthetic/missing pageshow observation.
    // Do not queue a new start behind a worker intentionally retired for idle.
    if (this.navigationSuspended) {
      this.navigationSuspended = false;
      try { this.install("conversion"); } catch (error) { this.fail(error); throw error; }
    }
    // Keep static code for only the currently selected private engine. Avoid
    // accumulating a VPX module plus a MPEG-2 pair across mixed-format jobs.
    if (!isVpxDecoderProfile(message.profileId)) { this.vpxCompiledCore = null; this.staticCodeSlot?.clear(); }
    if (message.profileId !== MPEG2_JOB_PROFILE) { this.mpeg2CompiledCore = null; this.mpeg2CodeSlot?.clear(); }
    const cached = this.staticCodeSlot?.get() ?? this.vpxCompiledCore;
    const mpeg2Cached = this.mpeg2CodeSlot?.get() ?? this.mpeg2CompiledCore;
    const forwarded = cached && isVpxDecoderProfile(message.profileId)
      ? { ...message, vpxCompiledCore: cached } : mpeg2Cached && message.profileId === MPEG2_JOB_PROFILE
        ? { ...message, mpeg2CompiledCore: mpeg2Cached } : message;
    const queued = this.role === "save" || !this.ready ? structuredClone(forwarded) : null;
    this.vpxPreparedJobId = null;
    this.mpeg2PreparedJobId = null;
    this.job = { jobId: message.jobId, profileId: message.profileId, sourceBytes: message.file.size,
      destination: { ...message.destination }, cancellationBuffer: message.cancellationBuffer, testFault: message.testFault };
    try {
      if (this.role === "save") { this.stopActive(); this.pending = queued; this.install("conversion"); }
      else if (this.ready) this.active!.postMessage(forwarded);
      else this.pending = queued;
    } catch (error) { this.fail(error); throw error; }
  }
  terminate(): void {
    if (this.disposed) return;
    this.lifecycleTarget?.removeEventListener("pagehide", this.onPageHide);
    this.lifecycleTarget?.removeEventListener("pageshow", this.onPageShow);
    this.navigationSuspended = false;
    this.disposed = true; this.pending = null; this.pendingCancel = false; this.job = null; this.stopActive();
    this.vpxCompiledCore = null; this.vpxPreparedJobId = null;
    this.mpeg2CompiledCore = null; this.mpeg2PreparedJobId = null;
    this.onmessage = null; this.onerror = null; this.onmessageerror = null;
  }
}

export function createStagedWorkerCoordinator(conversion: () => Worker, save: () => Worker, staticCodeSlot?: VpxCompiledCoreSlot, mpeg2CodeSlot?: Mpeg2CompiledCoreSlot): Worker {
  return new StagedWorkerCoordinator(conversion, save, staticCodeSlot, mpeg2CodeSlot);
}
