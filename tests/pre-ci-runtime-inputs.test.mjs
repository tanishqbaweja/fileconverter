import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { decodePreCiRuntimeInput, readPreCiRuntimeInput } from "./helpers/pre-ci-runtime-inputs.mjs";
import { readPreImageSizePatch } from "./helpers/pre-image-size-patch.mjs";
import { readPreSvgMemoryInput } from "./helpers/pre-svg-memory-inputs.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const archive = JSON.parse(await readFile(new URL("../fixtures/source/pre-ci-runtime-2026-10-29.json", import.meta.url)));

test("historical worker preserves exact mixed Windows bytes; normalized source is independently pinned, not live acceptance", async () => {
  const bytes = await readPreCiRuntimeInput("worker/index.ts");
  assert.equal(bytes.length, 2036); assert.equal((bytes.toString().match(/\r\n/g) ?? []).length, 7);
  const lf = Buffer.from(bytes.toString().replace(/\r\n/g, "\n"));
  assert.equal(sha(lf), "427c980ca2d22a309a355f1cb9b1a3fadfb5cecb86cc1d3071530d8117e17c30");
  assert.equal(sha(bytes), "e43e89df0db0146e75d8a71123e4dd08881ed63dfb4b7190cf5a7bdf671420ee");
  const live = await readFile("worker/index.ts");
  assert.equal(sha(Buffer.from(live.toString().replace(/\r\n/g, "\n"))), sha(lf));
});

test("prior CI bytes match original receipts while the changed live workflow is not mislabelled executed historical source", async () => {
  const old = await readPreCiRuntimeInput(".github/workflows/ci.yml"), live = await readFile(".github/workflows/ci.yml");
  assert.equal(sha(old), "c60872fd9264e255ba8b8a629e7e2cf4b8d798bf5c1968dc5a1880bb54bf7a47");
  assert.notEqual(sha(live), sha(old));
  assert.doesNotMatch(old.toString(), /ci-owned-runtime/); assert.match(live.toString(), /ci-owned-runtime/);
  const ordinary = "scripts/lib/owned-runtime-scratch.mjs";
  assert.deepEqual(await readPreCiRuntimeInput(ordinary), await readFile(ordinary));
});

test("historical source decoding refuses unknown paths, changed commit, bytes, pins and compressed payload", () => {
  assert.throws(() => decodePreCiRuntimeInput("test.mkv", archive));
  for (const change of [
    value => { value.sourceCommit = "a".repeat(40); },
    value => { value.files["worker/index.ts"].bytes++; },
    value => { value.files["worker/index.ts"].sha256 = "a".repeat(64); },
    value => { value.files["worker/index.ts"].gitBlobSha256 = "b".repeat(64); },
    value => { value.files["worker/index.ts"].gzipBase64 = Buffer.from("invalid").toString("base64"); },
  ]) { const copy = structuredClone(archive); change(copy); assert.throws(() => decodePreCiRuntimeInput("worker/index.ts", copy)); }
});

test("all pins in affected historical receipts pass a Git-blob LF checkout audit, collecting every mismatch before failing", async () => {
  const json = async file => JSON.parse(await readFile(file));
  const size = await json("evidence/2026-10-28-image-size-patch-verification.json");
  const cycle = await json("evidence/2026-10-28-idle-worker-cycle.json");
  const navigation = await json("evidence/2026-10-28-idle-navigation-fixed-terminal.json");
  const installed = await json("evidence/2026-10-27-installed-browser-privacy-refresh.json");
  const targets = [
    [size.privacyBrowserReceipt.path, readPreSvgMemoryInput],
    [cycle.privacyReceipt.path, readPreSvgMemoryInput],
    [navigation.raw.path, readPreSvgMemoryInput],
  ];
  for (const entry of installed.passed) targets.push([(await json(entry.path)).productionReceipt.path, readPreImageSizePatch]);
  const execute = promisify(execFile), cache = new Map(), failures = []; let checked = 0;
  const readLive = async file => {
    assert.match(file, /^[a-zA-Z0-9._/-]+$/);
    if (!cache.has(file)) cache.set(file, execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["show", `HEAD:${file}`],
      { windowsHide: true, encoding: "buffer", maxBuffer: 1024 * 1024 }).then(result => result.stdout));
    return cache.get(file);
  };
  for (const [receipt, reader] of targets) for (const [file, digest] of Object.entries((await json(receipt)).sourcePins)) {
    try {
      let bytes = await reader(file, { readLive });
      if (file === installed.repair.path && digest === installed.repair.beforeSha256) {
        const currentTab = "  // Leave browser-owned startup tabs alone; GX Corner can replace their navigation.\n  page = await context.newPage();";
        const source = bytes.toString(); assert.equal(source.split(currentTab).length, 2);
        bytes = Buffer.from(source.replace(currentTab, "  page = context.pages()[0] ?? (await context.newPage());"));
      }
      if (sha(bytes) !== digest) failures.push({ receipt, file, expected: digest, actual: sha(bytes) });
    } catch (error) { failures.push({ receipt, file, error: String(error) }); }
    checked++;
  }
  assert.ok(checked >= 50, "Audit every source pin, not just the first failed file");
  assert.deepEqual(failures, []);
});
