// One exact obsolete owned static tool. No media, profiles or broad work cleanup.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), target = path.join(root, "work/vp9-duration-input-42013264823");
const output = path.join(root, "evidence/2026-11-05-vp9-duration-superseded-input-cleanup.json");
const json = async file => JSON.parse(await readFile(path.join(root, file)));
const old = await json("evidence/2026-11-05-vp9-duration-native-42013264823.json"),
  replacement = await json("evidence/2026-11-05-vp9-duration-native-42020605269.json"),
  browser = await json("evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269.json");
await assert.rejects(access(output), { code: "ENOENT" });
assert.equal(browser.status, "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
assert.equal(browser.privateCpuOverride.runId, replacement.runId); assert.equal(browser.privateCpuOverride.sourceHead, replacement.head);
assert.equal(browser.independentFidelity.passed, true); assert.equal(browser.storedTiming.explicitDefaultDurationGatePassed, true);
assert.equal(browser.ownedRuntimeRemoved, true); assert.ok(browser.processCleanup.every(row => row.status === "owned-identity-absent"));
assert.equal(old.runId, 42013264823); assert.equal(replacement.runId, 42020605269);
assert.equal(path.dirname(target), path.join(root, "work")); assert.equal(await realpath(target), target);
const identity = await lstat(target, { bigint: true }); assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
const owner = await json("work/vp9-duration-input-42013264823/owned-input.json");
assert.equal(owner.runId, old.runId); assert.equal(owner.head, old.head);
assert.equal(owner.dev, String(identity.dev)); assert.equal(owner.ino, String(identity.ino));
const names = Object.keys(old.nativeContract.artifacts).concat("build-manifest.json", "owned-input.json").sort();
assert.equal(names.length, 17); assert.deepEqual((await readdir(target)).sort(), names);
let bytes = 0;
for (const file of names) {
  assert.match(file, /^[a-zA-Z0-9_.-]+$/);
  const absolute = path.join(target, file), before = await lstat(absolute, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size > 0n && before.size <= 16777216n);
  const content = await readFile(absolute);
  if (file === "build-manifest.json") assert.deepEqual(JSON.parse(content), old.nativeContract);
  else if (file !== "owned-input.json") { const pin = old.nativeContract.artifacts[file];
    assert.equal(content.length, pin.bytes); assert.equal(createHash("sha256").update(content).digest("hex"), pin.sha256); }
  const after = await lstat(absolute, { bigint: true });
  for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]); bytes += content.length;
}
const last = await lstat(target, { bigint: true }); assert.equal(last.dev, identity.dev); assert.equal(last.ino, identity.ino);
assert.equal(await realpath(target), target);
const report = { target: "work/vp9-duration-input-42013264823", ownedRunId: old.runId, files: names.length, bytes,
  verifiedExactOwnedContents: true, replacementRunId: replacement.runId, replacementStrictSmallBrowserPassed: true,
  recovery: { artifactId: old.artifact.id, artifactExpiresAt: old.artifact.expiresAt, pinnedSourceRebuildHead: old.head, localCopyRetained: false },
  userMediaReadOrRemoved: false, removed: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
await rm(target, { recursive: true }); await assert.rejects(access(target), { code: "ENOENT" }); report.removed = true;
await writeFile(output, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
