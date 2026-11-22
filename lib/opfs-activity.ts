import { MPEG2_JOB_PROFILE } from "./mpeg2-stage-policy";

const activityLock = "within:temporary-storage:v1";
const stagedProfiles = new Set([
  "mp4-to-avi", "mov-to-avi", "3gp-to-avi", "mkv-to-avi", "mpeg-ts-to-avi",
  "mkv-to-mp4", "avi-to-3gp", "avi-to-mpeg-ts", "m2v-to-ogv", MPEG2_JOB_PROFILE,
]);
const scratchProfiles = new Set([
  "tar-to-sevenzip", "tar-gz-to-sevenzip", "tar-bz2-to-sevenzip", "tar-xz-to-sevenzip", "zip-to-sevenzip",
]);

export const usesStagedOutput = (profileId: string, correctedDirectMkv?: true) =>
  !correctedDirectMkv && stagedProfiles.has(profileId);

export const batchUsesOpfs = (profileId: string, testMode: boolean, correctedDirectMkv?: true) =>
  testMode || usesStagedOutput(profileId, correctedDirectMkv) || scratchProfiles.has(profileId);

export async function acquireOpfsActivity(locks?: LockManager): Promise<() => void> {
  // Without coordination, the worker still cleans its own files, but sweeping
  // files that could belong to another tab is disabled.
  if (!locks) return () => {};
  const ready = Promise.withResolvers<() => void>();
  const hold = Promise.withResolvers<void>();
  void locks.request(activityLock, { mode: "shared", ifAvailable: true }, async lock => {
    if (!lock) throw new Error("Temporary storage is being cleared in another tab. Try again shortly.");
    ready.resolve(hold.resolve);
    await hold.promise;
  }).catch(ready.reject);
  return ready.promise;
}

type CleanupResult = { status: "cleared" | "active" | "unavailable"; removed: number };

export async function sweepOpfsTemporaryStorage(storage?: StorageManager, locks?: LockManager): Promise<CleanupResult> {
  if (!storage?.getDirectory || !locks) return { status: "unavailable", removed: 0 };
  return locks.request(activityLock, { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) return { status: "active", removed: 0 };
    const root = await storage.getDirectory();
    let removed = 0;
    for await (const [name, entry] of root.entries()) {
      if (entry.kind !== "file" || !(name.startsWith("within-test-") || name.startsWith("within-stage-") || name.startsWith("within-sevenzip-scratch-"))) continue;
      try {
        await root.removeEntry(name);
        removed++;
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
    }
    return { status: "cleared", removed };
  });
}

export function describeOpfsSweep({ status, removed }: CleanupResult, stale: boolean): string {
  if (status === "active") return "Temporary storage cleanup deferred: another tab is using it.";
  if (status === "unavailable") return "Safe temporary storage cleanup is unavailable in this browser.";
  if (removed === 0) return "No app-owned temporary files detected.";
  return `Removed ${removed} ${stale ? "stale " : ""}app-owned temporary ${removed === 1 ? "file" : "files"}.`;
}
