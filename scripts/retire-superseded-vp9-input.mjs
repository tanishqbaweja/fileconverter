// Retire exactly one superseded owned static tool, never user media or other work.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), target = path.join(root, "work/webcodecs-vp9-input-41305653513");
const output = path.join(root, "evidence/2026-11-01-webcodecs-vp9-superseded-input-cleanup.json");
await assert.rejects(access(output), { code: "ENOENT" });
const old = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-native-41305653513.json")));
const current = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-rebuilt-native.json")));
assert.equal(current.status, "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance");
assert.equal(current.nativeTool.runId, 41309113218); assert.equal(current.independentFullDecodePassed, true);
assert.equal(current.ownedRuntimeRemoved, true); assert.ok(current.processCleanup.every(x => x.status === "owned-identity-absent"));
assert.equal(path.dirname(target), path.join(root, "work")); assert.equal(await realpath(target), target);
const identity = await lstat(target, { bigint: true }); assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
const owner = JSON.parse(await readFile(path.join(target, "owned-input.json")));
assert.equal(owner.runId, 41305653513); assert.equal(owner.head, old.head);
assert.equal(owner.dev, String(identity.dev)); assert.equal(owner.ino, String(identity.ino));
const expected = Object.fromEntries(Object.entries(old.nativeContract.artifacts).map(([file, record]) => [file, record.sha256]));
for (const [file, source] of Object.entries({ "within_remux.c": "media/ffmpeg/within_remux.c", "within_webcodecs_vp9.c": "media/ffmpeg/within_webcodecs_vp9.c",
  "mpeg2-split-frame-layout.h": "media/ffmpeg/mpeg2-split-frame-layout.h", "build-webcodecs-vp9.sh": "media/ffmpeg/build-webcodecs-vp9.sh",
  "register-webcodecs-vp9.mjs": "media/ffmpeg/register-webcodecs-vp9.mjs", "webcodecs-vp9-bridge.mjs": "workers/webcodecs-vp9-bridge.mjs" }))
  expected[file] = old.nativeContract.sources[source];
expected["native-contract.json"] = old.nativeContractSha256;
const names = Object.keys(expected).concat("owned-input.json").sort(); assert.deepEqual((await readdir(target)).sort(), names);
let bytes = 0;
for (const file of names) {
  const absolute = path.join(target, file), before = await lstat(absolute, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size <= 8388608n);
  const content = await readFile(absolute); if (file !== "owned-input.json") assert.equal(createHash("sha256").update(content).digest("hex"), expected[file]);
  const after = await lstat(absolute, { bigint: true });
  for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]); bytes += content.length;
}
const finalIdentity = await lstat(target, { bigint: true }); assert.equal(finalIdentity.dev, identity.dev); assert.equal(finalIdentity.ino, identity.ino);
assert.equal(await realpath(target), target);
const report = { target: path.relative(root, target).replaceAll("\\", "/"), ownedRunId: 41305653513, files: names.length, bytes,
  verifiedExactOwnedContents: true, replacementRunId: 41309113218, replacementBrowserRegressionPassed: true,
  recovery: { artifactId: old.artifact.id, artifactExpiresAt: old.artifact.expiresAt,
    pinnedSourceRebuildHead: old.head, localCopyRetained: false }, userMediaReadOrRemoved: false,
  removed: false, publicAcceptance: false };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
await rm(target, { recursive: true }); await assert.rejects(access(target), { code: "ENOENT" }); report.removed = true;
await writeFile(output, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
