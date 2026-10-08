// Source generation only, never native conversion or browser acceptance.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeAiffId3SpecialistSource } from "./aiff-id3-specialist-source.mjs";
const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work");
const args = process.argv.slice(2); assert.equal(args.length, 2);
const source = path.resolve(args[0]), output = path.resolve(args[1]);
assert.equal(path.basename(source), "within_remux.c"); assert.equal(path.basename(output), "within_aiff.c");
assert.ok(source === path.join(root, "media/ffmpeg/within_remux.c") || source.startsWith(work + path.sep));
assert.ok(output.startsWith(work + path.sep));
assert.equal(await realpath(path.dirname(output)), path.dirname(output));
await assert.rejects(access(output), { code: "ENOENT" });
const maker = path.join(root, "media/ffmpeg/make-aiff-specialist.mjs");
assert.equal(createHash("sha256").update(await readFile(maker)).digest("hex"),
  "58750a89366d79a09d81996bd8b3f348cdeec24055a196b413c91e746746d2f4");
const runtime = await createOwnedRuntimeScratch("aiff-id3-source-");
try {
  const baseline = path.join(runtime.directory, "within_aiff.c");
  await promisify(execFile)(process.execPath, [maker, source, baseline], { cwd: root,
    env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  const candidate = makeAiffId3SpecialistSource(await readFile(baseline, "utf8"));
  await writeFile(output, candidate, { flag: "wx" });
  console.log(`${createHash("sha256").update(candidate).digest("hex")}  ${output}`);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
