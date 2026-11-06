// One exact obsolete owned static tool. No media, profiles or broad work cleanup.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
const originalWidth = process.argv[2] === "--original-width";
const diagnostic = process.argv[2] === "--allocation-diagnostic";
const temporalGuard = process.argv[2] === "--temporal-guard", dated = originalWidth || temporalGuard || diagnostic;
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && dated));
const oldId = diagnostic?42135708757:temporalGuard ? 42129383089 : originalWidth ? 42122918540 : 42013264823, newId = diagnostic?42218018139:temporalGuard ? 42135708757 : originalWidth ? 42129383089 : 42020605269;
const root = path.resolve(import.meta.dirname, ".."), target = path.join(root, "work/vp9-duration-input-" + oldId);
const output = path.join(root, diagnostic?"evidence/2026-11-06-vp9-diagnostic-superseded-input-cleanup.json":temporalGuard ? "evidence/2026-11-06-vp9-temporal-superseded-input-cleanup.json" : originalWidth ? "evidence/2026-11-06-vp9-original-width-superseded-input-cleanup.json" : "evidence/2026-11-05-vp9-duration-superseded-input-cleanup.json");
const json = async file => JSON.parse(await readFile(path.join(root, file)));
const nativePrefix = dated ? "evidence/2026-11-06-vp9-original-width-native-" : "evidence/2026-11-05-vp9-duration-native-";
const old = await json(nativePrefix + oldId + ".json"), replacement = await json(nativePrefix + newId + ".json"),
  browser = await json(diagnostic?"evidence/2026-11-06-vp9-lazy-qualification-42218018139.json":temporalGuard ? "evidence/2026-11-06-vp9-allocation-qualification-42135708757.json" : originalWidth ? "evidence/2026-11-06-vp9-temporal-qualification-42129383089.json" : "evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269.json");
await assert.rejects(access(output), { code: "ENOENT" });
assert.equal(browser.status, dated ? "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance" : "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
if (dated) {
  assert.equal(browser.recovery.passed, true); assert.equal(browser.temporalAllocationGuard.bitExactComparedWithUnmodifiedLibvpx, true);
  assert.equal(old.nativeContract.candidate.compiledWrapperSha256, replacement.nativeContract.candidate.compiledWrapperSha256);
  assert.equal(replacement.nativeContract.engine, diagnostic?"private-vp9-lazy-utility":temporalGuard ? "private-vp9-allocation-diagnostic" : "private-vp9-realtime-temporal");
  if (temporalGuard || diagnostic) for (const name of ["vp9_encoder.temporal.base.c", "vp9_encoder.temporal.guard.c",
    ...(diagnostic?["vp9_encoder.allocation.diagnostic.c","yv12config.allocation.base.c","yv12config.allocation.diagnostic.c"]:[])])
    assert.deepEqual(old.nativeContract.artifacts[name],replacement.nativeContract.artifacts[name],"Exact source preimage retained with replacement");
}
assert.equal(browser.privateCpuOverride.runId, replacement.runId); assert.equal(browser.privateCpuOverride.sourceHead, replacement.head);
assert.equal(browser.independentFidelity.passed, true); assert.equal(browser.storedTiming.explicitDefaultDurationGatePassed, true);
assert.equal(browser.ownedRuntimeRemoved, true); assert.ok(browser.processCleanup.every(row => row.status === "owned-identity-absent"));
assert.equal(old.runId, oldId); assert.equal(replacement.runId, newId);
assert.equal(path.dirname(target), path.join(root, "work")); assert.equal(await realpath(target), target);
const identity = await lstat(target, { bigint: true }); assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
const owner = await json("work/vp9-duration-input-" + oldId + "/owned-input.json");
assert.equal(owner.runId, old.runId); assert.equal(owner.head, old.head);
assert.equal(owner.dev, String(identity.dev)); assert.equal(owner.ino, String(identity.ino));
const names = Object.keys(old.nativeContract.artifacts).concat("build-manifest.json", "owned-input.json").sort();
assert.equal(names.length, diagnostic?27:temporalGuard ? 20 : 17); assert.deepEqual((await readdir(target)).sort(), names);
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
const report = { target: "work/vp9-duration-input-" + oldId, ownedRunId: old.runId, files: names.length, bytes,
  verifiedExactOwnedContents: true, replacementRunId: replacement.runId, replacementStrictSmallBrowserPassed: true,
  sourcePreimagesRetainedWithReplacement: (temporalGuard||diagnostic) ? true : null,
  recovery: { artifactId: old.artifact.id, artifactExpiresAt: old.artifact.expiresAt, pinnedSourceRebuildHead: old.head, localCopyRetained: false },
  userMediaReadOrRemoved: false, removed: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
await rm(target, { recursive: true }); await assert.rejects(access(target), { code: "ENOENT" }); report.removed = true;
await writeFile(output, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
