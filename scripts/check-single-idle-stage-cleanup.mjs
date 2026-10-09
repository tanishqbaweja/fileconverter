// Actual new-slot staging/restoration only: no browser, conversion or source fixture read.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { SINGLE_IDLE_SLOT, SINGLE_IDLE_DECODER_SHA } from "./lib/single-idle-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), output = "evidence/single-idle-stage-cleanup-2026-10-10.json";
assert.equal(process.argv.length, 2); await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const execute = args => promisify(execFile)(process.execPath, ["scripts/stage-mpeg2-single-idle-abort.mjs", ...args],
  { cwd: root, env: { ...process.env, WITHIN_MPEG2_SPLIT_CANDIDATE_DIR: SINGLE_IDLE_SLOT }, windowsHide: true, timeout: 30000, maxBuffer: 16384 });
let staged = false, failure = null;
try {
  await execute(["stage"]); staged = true;
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux/_private_split_decoder.wasm"))), SINGLE_IDLE_DECODER_SHA);
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux/within-remux.mjs"))), "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837");
} catch (error) { failure = String(error.stack ?? error); }
finally { if (staged) await execute(["restore"]); }
const restored = {};
for (const name of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  restored[name] = sha(await readFile(path.join(root, "public/engines/remux", name)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", name))), restored[name]);
}
for (const name of ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), status: failure ? "failed" : "actual-new-core-and-byte-exact-observer-stage-restore-passed",
  failure, stagedNewDecoderSha256: SINGLE_IDLE_DECODER_SHA, observerSha256: "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837",
  restored, ninePrivateAdditionsAbsent: true, subprocessWindowsHidden: true, browserLaunches: 0,
  conversions: 0, originalRead: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, failure, restored: true })); assert.equal(failure, null);
