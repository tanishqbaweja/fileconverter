import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyHostedAudioScopeProof } from "./lib/hosted-audio-scope-proof.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = "evidence/audio-destination-scopes-hosted-2026-10-08.json";
const bytes = await readFile(path.join(root, input)); assert.ok(bytes.length < 2 * 1024 ** 2);
const proof = JSON.parse(bytes), verified = verifyHostedAudioScopeProof(proof);
assert.equal(sha(await readFile(new URL("./collect-audio-destination-scopes-hosted.mjs", import.meta.url))), proof.collectorSourceSha256);
for (const [file, expected] of Object.entries(verified.cases[0].sourcePins)) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path.join(root, file), { highWaterMark: 65536 })) hash.update(chunk);
  assert.equal(hash.digest("hex"), expected, file);
}
await assert.rejects(access(proof.downloadRuntime), { code: "ENOENT" });
const report = { recordedAt: new Date().toISOString(), ...verified,
  input: { path: input, bytes: bytes.length, sha256: sha(bytes) }, runId: proof.run.databaseId,
  executedCommit: proof.run.headSha, artifactId: proof.artifact.id, ownedDownloadIndependentlyAbsent: true,
  executedHarnessValidatorDeclarationEnginePinsVerified: true,
  sourcePins: { "scripts/freeze-audio-destination-scopes-hosted.mjs": sha(await readFile(new URL(import.meta.url))),
    "scripts/lib/hosted-audio-scope-proof.mjs": sha(await readFile(new URL("./lib/hosted-audio-scope-proof.mjs", import.meta.url))) },
  limitations: ["Bundled Chromium 151 is the observed hosted browser, not current installed stable Chrome/Edge/Brave/Opera.",
    "Small 2-second fixtures: no new original-size or scaling, complete-process-memory, speed A/B, lossy quality, artwork or privacy/offline acceptance.",
    "Exact common Unicode fields do not prove every alias, arbitrary representable field or destination-specific artwork.",
    "Hosted cleanup step/report assertions passed; remote filesystem identities are not independently accessible after runner teardown.",
    "The prior failed typecheck is distinct and remains recorded; production runtime/engine is unchanged."] };
const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 128 * 1024);
await writeFile(path.join(root, "evidence/audio-destination-scopes-hosted-verification-2026-10-08.json"), json, { flag: "wx" });
console.log(JSON.stringify({ status: report.status, browser: report.browser, cases: report.cases.map(row => ({
  profileId: row.profileId, sourceBytes: row.sourceBytes, outputBytes: row.outputBytes })),
  preservedFields: report.preservedFields, independentDecodes: report.fullIndependentDecodes,
  downloadAbsent: true }));
