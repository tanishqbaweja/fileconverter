import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const built = await build({ entryPoints: ["lib/opfs-activity.ts"], bundle: true, format: "esm", write: false, platform: "browser" });
const { acquireOpfsActivity, batchUsesOpfs, describeOpfsSweep, sweepOpfsTemporaryStorage, usesStagedOutput } =
  await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64"));

function locksForOrigin() {
  const active = [];
  return { async request(name, { mode, ifAvailable }, callback) {
    assert.equal(name, "within:temporary-storage:v1");
    assert.equal(ifAvailable, true);
    if (active.some(value => mode === "exclusive" || value === "exclusive")) return callback(null);
    active.push(mode);
    try { return await callback({ mode, name }); }
    finally { active.splice(active.indexOf(mode), 1); }
  } };
}

test("two storage users can coexist; sweeping cannot enumerate while either is active", async () => {
  const locks = locksForOrigin();
  const first = await acquireOpfsActivity(locks), second = await acquireOpfsActivity(locks);
  const storage = { async getDirectory() { assert.fail("unsafe enumeration"); } };
  const busy = { status: "active", removed: 0 };
  try {
    assert.deepEqual(await sweepOpfsTemporaryStorage(storage, locks), busy);
    first(); first();
    assert.deepEqual(await sweepOpfsTemporaryStorage(storage, locks), busy);
  } finally { first(); second(); }
  assert.match(describeOpfsSweep(busy, false), /deferred/);
  assert.deepEqual(await sweepOpfsTemporaryStorage(undefined, locks), { status: "unavailable", removed: 0 });
  assert.deepEqual(await sweepOpfsTemporaryStorage(storage, undefined), { status: "unavailable", removed: 0 });
});

test("sweep removes only known scratch files, holds the exclusive lock, and releases it on I/O failure", async () => {
  const locks = locksForOrigin();
  const files = new Map([
    ["within-test-abandoned", "file"], ["within-stage-old", "file"], ["within-sevenzip-scratch-aborted", "file"],
    ["within-stage-unrelated-directory", "directory"], ["within-user-owned.txt", "file"], ["test.mp4", "file"],
  ]);
  const root = {
    async *entries() { for (const [name, kind] of files) yield [name, { kind }]; },
    async removeEntry(name, ...options) {
      assert.deepEqual(options, []);
      await assert.rejects(acquireOpfsActivity(locks), /being cleared/);
      files.delete(name);
    },
  };
  const storage = { async getDirectory() { return root; } };
  assert.deepEqual(await sweepOpfsTemporaryStorage(storage, locks), { status: "cleared", removed: 3 });
  assert.deepEqual([...files.keys()], ["within-stage-unrelated-directory", "within-user-owned.txt", "test.mp4"]);
  await assert.rejects(sweepOpfsTemporaryStorage({ async getDirectory() { throw new Error("injected I/O error"); } }, locks), /injected I\/O/);
  const release = await acquireOpfsActivity(locks); release();
});

test("the scratch-bearing production routes are protected and ordinary direct routes stay lock-free", () => {
  assert.ok(usesStagedOutput("mp4-to-avi"));
  assert.ok(usesStagedOutput("mkv-to-mp4"));
  assert.equal(usesStagedOutput("mkv-to-mp4", true), false);
  for (const profile of ["tar-to-sevenzip", "tar-gz-to-sevenzip", "tar-bz2-to-sevenzip", "tar-xz-to-sevenzip", "zip-to-sevenzip"])
    assert.ok(batchUsesOpfs(profile, false), profile);
  assert.equal(batchUsesOpfs("txt-to-html", false), false);
  assert.equal(batchUsesOpfs("txt-to-html", true), true);
});
