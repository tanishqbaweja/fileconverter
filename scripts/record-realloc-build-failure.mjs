// Retain the exact terminal job/log/source versions BEFORE correcting code.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { REALLOC_NATIVE_FILES } from "../media/ffmpeg/mpeg2-realloc-builder-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), runId = "38523571937", call = promisify(execFile);
const gh = async args => (await call("D:/Program Files/GitHub CLI/gh.exe", args,
  { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 16777216 })).stdout;
const run = JSON.parse(await gh(["run", "view", runId, "--repo", "tanishqbaweja/fileconverter", "--json", "databaseId,headSha,status,conclusion,jobs,url"]));
assert.equal(run.status, "completed"); assert.equal(run.conclusion, "failure"); assert.equal(run.headSha, "f366cbb5563e51273fad20d295bdd09f2a5dcaf6");
assert.equal(run.jobs.length, 1); const job = run.jobs[0];
assert.equal(job.steps.find(x => x.name === "Remove repository-local build data").conclusion, "success");
const logs = await gh(["api", `repos/tanishqbaweja/fileconverter/actions/jobs/${job.databaseId}/logs`]);
const assertion = logs.split("\n").find(x => x.includes("Aborted(Assertion failed: within_realloc_attempt_words[9] == 8192 && within_realloc_attempt_words[11] == 2"));
assert.ok(assertion); assert.ok(assertion.length < 2048);
const listing = JSON.parse(await gh(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`])); assert.equal(listing.total_count, 0);
const prior = JSON.parse(await readFile(path.join(root, "evidence/packet-largest-idle-native-sources-38327579000.json")));
const files = [...new Set([...Object.keys(prior.sourcePins), ...REALLOC_NATIVE_FILES])].sort(); assert.ok(files.length <= 128);
const pins = {}, preimages = {};
for (const file of files) {
  const { stdout } = await call("git", ["show", `${run.headSha}:${file}`], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
  const bytes = Buffer.from(stdout); assert.ok(bytes.length <= 2097152); pins[file] = sha(bytes); preimages[file] = bytes.toString("base64");
  if (file !== ".github/workflows/reproduce-ffmpeg-nondocker.yml") assert.equal(sha(await readFile(path.join(root, file))), pins[file]);
}
async function retain(file, bytes, maximum) {
  assert.ok(bytes.length <= maximum); const zipped = gzipSync(bytes, { level: 9 }); assert.deepEqual(gunzipSync(zipped), bytes);
  await writeFile(path.join(root, file), zipped, { flag: "wx" }); assert.equal(sha(await readFile(path.join(root, file))), sha(zipped));
  return { path: file, bytes: zipped.length, sha256: sha(zipped), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
}
const sourceArchive = await retain(`outputs/reports/realloc-build-${runId}-failed-git-sources.json.gz`, Buffer.from(JSON.stringify({ pins, preimages })), 2097152);
const logArchive = await retain(`outputs/reports/realloc-build-${runId}-failed-job-log.txt.gz`, Buffer.from(logs), 16777216);
const own = "scripts/record-realloc-build-failure.mjs", ownBytes = await readFile(path.join(root, own));
const proof = { recordedAt: new Date().toISOString(), status: "actual-native-build-failed-alias-growth-scalar-control-not-acceptance", run,
  firstAssertion: assertion, noCandidateArtifacts: true, hostedBuildCleanupPassed: true,
  failedGitHeadSourceCount: files.length, sourcePins: pins, sourceArchive, logArchive,
  sourceMethod: "Exact executed Git-head preimages plus prior bounded native closure and new native files; not a post-build completed manifest or browser acceptance.",
  observedOldSizeWord: null, observedRefcountWord: null,
  candidateCause: "Alias-growth outer metadata assertion failed; recursive wrapped AVBuffer call can replace the outer slot. No failed scalar dump was retained, so exact observed values/cause are not claimed proven.",
  nextAction: "Preserve outer scope across native AVBuffer recursion, add synthetic recursion and actual-library control, do not weaken assertions or allocator/heap/codec/I/O.",
  browserConversions: 0, originalRead: false, nativeFailureRequestProven: false, fullOriginalAcceptance: false, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
const output = `evidence/realloc-build-${runId}-failure.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: files.length, sourceArchiveBytes: sourceArchive.bytes, logArchiveBytes: logArchive.bytes, hostedCleanupPassed: true }));
