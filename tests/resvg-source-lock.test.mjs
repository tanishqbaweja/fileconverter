import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { pins, pinCargoManifest, inspectCandidateLock, sha } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const packageBlock = (name, version, source, checksum) => `[[package]]\nname = "${name}"\nversion = "${version}"\n${source ? `source = "${source}"\n` : ""}${checksum ? `checksum = "${checksum}"\n` : ""}`;
const sampleLock = () => [packageBlock("wasm-bindgen", "0.2.92"), packageBlock("js-sys", "0.3.69"),
  packageBlock("resvg", "0.34.0", `git+https://github.com/zimond/resvg?rev=${pins.resvg}#${pins.resvg}`),
  packageBlock("woff2", "0.3.0", `git+https://github.com/yisibl/woff2-rs?rev=${pins.woff2}#${pins.woff2}`),
  ...Array.from({ length: 8 }, (_, index) => packageBlock("fixture" + index, "1.0.0", "registry+https://github.com/rust-lang/crates.io-index", "a".repeat(64)))].join("\n");

test("SVG source manifest pinning rejects unknown bytes and replaces only exact five source anchors", async () => {
  const source = await read("fixtures/source/resvg-2.6.2-Cargo.toml"); assert.equal(sha(source), pins.cargoTomlSha256);
  const result = pinCargoManifest(source);
  assert.match(result, /rust-version = "1.76"/); assert.match(result, /wasm-bindgen = "=0.2.92"/);
  assert.match(result, /js-sys = "=0.3.69"/);
  assert.ok(result.includes(`rev = "${pins.resvg}"`)); assert.ok(result.includes(`rev="${pins.woff2}"`));
  assert.doesNotMatch(result, /branch=/); assert.throws(() => pinCargoManifest(source + "\n"));
  assert.throws(() => pinCargoManifest(result));
  assert.equal(pins.compilerToolchain, "nightly-2023-12-11"); assert.equal(pins.resolverToolchain, "1.90.0");
});
test("bounded candidate lock verifier rejects missing registry checksums, mismatched revisions and bindgen skew", () => {
  const lock = sampleLock(), row = inspectCandidateLock(lock);
  assert.equal(row.packages, 12); assert.equal(row.registryPackages, 8); assert.equal(row.gitPackages, 2);
  assert.equal(row.initialCandidateLockNotHistoricalPublicationLock, true);
  for (const bad of [lock.replace('checksum = "' + "a".repeat(64) + '"', 'checksum = "missing"'),
    lock.replace("#" + pins.resvg, "#deadbeef"), lock.replace('version = "0.2.92"', 'version = "0.2.93"'),
    lock.replace("rev=" + pins.woff2, "branch=main"), "x".repeat(262145)]) assert.throws(() => inspectCandidateLock(bad));
});
test("private resolver uses verified owned scratch, pinned resolver and no compiler/public-engine write or native conversion", async () => {
  const shell = await read("images/resvg-source/resolve-lock.sh"), driver = await read("images/resvg-source/resolve-lock.mjs");
  assert.match(shell, /mktemp -d "\$TASK_ROOT\/work\/resvg-source-lock-XXXXXX"/);
  assert.match(shell, /trap task_cleanup EXIT/); assert.match(shell, /stat -c '%d:%i'/);
  assert.match(shell, /realpath "\$task_scratch"/); assert.match(shell, /rm -rf -- "\$task_scratch"/);
  assert.match(shell, /CARGO_HOME="\$task_scratch\/cargo" RUSTUP_HOME="\$task_scratch\/rustup"/);
  assert.ok(shell.includes(pins.resolverManifestSha256)); assert.ok(shell.includes(pins.upstream));
  assert.match(shell, /cargo generate-lockfile/); assert.match(shell, /cargo metadata --locked/);
  assert.doesNotMatch(shell, /cargo build|wasm-pack build|docker|test\.mkv|npm install/);
  assert.match(driver, /sourceCompilationAttempted: false/); assert.match(driver, /historicalDependencyGraphRecovered: false/);
  assert.match(driver, /compilerCompatibilityVerified: false/); assert.match(driver, /flag: "wx"/);
});
test("manual SVG lock scope runs no engine/browser/verify matrix and retains only bounded dependency evidence", async () => {
  const yaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"))("js-yaml");
  const workflow = yaml.load(await read(".github/workflows/ci.yml"));
  assert.ok(workflow.on.workflow_dispatch.inputs.engine.options.includes("svg-source-lock"));
  assert.match(workflow.jobs["engine-matrix"].if, /inputs.engine != 'svg-source-lock'/);
  for (const id of ["verify", "browser-conversions", "audio-destination-scopes"])
    assert.doesNotMatch(workflow.jobs[id].if, /svg-source-lock/);
  const job = workflow.jobs["svg-source-lock"];
  assert.match(job.if, /github.event_name == 'workflow_dispatch' && inputs.engine == 'svg-source-lock'/);
  assert.equal(job["timeout-minutes"], 15);
  assert.equal(job.steps.find(row => row.run)?.run, "bash images/resvg-source/resolve-lock.sh");
  const upload = job.steps.find(row => row.uses?.startsWith("actions/upload-artifact"));
  assert.equal(upload.if, "success()"); assert.equal(upload.with["retention-days"], 1);
  assert.match(upload.with.path, /^outputs\/reports\/resvg-source-lock-/);
});
test("current aggregate FFmpeg terminal proof closes exact comparison only, never SVG source or memory acceptance", async () => {
  const row = JSON.parse(await read("evidence/2026-10-27-ffmpeg-reproduction-terminal.json"));
  const dispatch = JSON.parse(await read("evidence/2026-10-27-ffmpeg-reproduction-dispatch.json"));
  assert.equal(row.runId, dispatch.runId); assert.equal(row.headSha, dispatch.headSha);
  assert.equal(row.conclusion, "success"); assert.equal(row.exactArtifactVerification, "success");
  assert.equal(row.ownedBuildDataCleanup, "success"); assert.equal(row.mismatchUpload, "skipped");
  assert.equal((Date.parse(row.rebuildCompletedAt) - Date.parse(row.rebuildStartedAt)) / 1000, row.rebuildSeconds);
  assert.ok(Date.parse(row.observedAt) >= Date.parse(dispatch.nextStatusCheckNotBefore));
  assert.match(row.logSha256, /^[a-f0-9]{64}$/); assert.equal(row.verifyAndBrowserJobsSkippedNotPassed, true);
  assert.equal(row.svgNativeSourceGapClosed, false); assert.equal(row.browserMemoryOrScalingAcceptance, false);
  assert.equal(row.originalGoalComplete, false);
});
