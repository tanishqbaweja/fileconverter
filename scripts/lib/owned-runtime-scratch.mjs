import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";

const expectedWork = path.resolve(import.meta.dirname, "../../work");

// Own only a newly created, unpredictable child of this repository's work.
// Never sweep/reuse old directories or retry a blocked historical target.
export async function createOwnedRuntimeScratch(prefix = "profile-runtime-") {
  assert.match(prefix, /^[a-z][a-z0-9-]{1,48}-$/);
  await mkdir(expectedWork, { recursive: true });
  const work = await realpath(expectedWork);
  const canonical = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  assert.equal(canonical(work), canonical(expectedWork), "Repository work must not redirect outside its approved path");
  const directory = await mkdtemp(path.join(work, prefix));
  const identity = await lstat(directory, { bigint: true });
  assert.equal(identity.isSymbolicLink(), false);
  let closing = null;
  return {
    directory,
    env: Object.freeze({ ...process.env, TEMP: directory, TMP: directory, TMPDIR: directory,
      NODE_COMPILE_CACHE: path.join(directory, "node-compile-cache"), WRANGLER_LOG_PATH: path.join(directory, "wrangler-logs") }),
    close() {
      closing ??= (async () => {
        assert.equal(path.dirname(directory), work);
        let current;
        try { current = await lstat(directory, { bigint: true }); }
        catch (error) { if (error.code === "ENOENT") return; throw error; }
        assert.ok(current.isDirectory() && !current.isSymbolicLink(), "Owned runtime directory was replaced");
        assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino, "Owned runtime identity changed");
        assert.equal(await realpath(directory), directory, "Owned scratch resolved outside its original path");
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      })();
      return closing;
    },
  };
}

// Try every independent finally action. Report failures, never silently accept
// successful cleanup just because one target was removed.
export async function finishOwnedCleanup(actions) {
  const outcomes = await Promise.allSettled(actions.map((action) => Promise.resolve().then(action)));
  const errors = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);
  if (errors.length) throw new AggregateError(errors, "One or more owned cleanup actions failed");
}
