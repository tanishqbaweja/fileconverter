import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeVpxJspiBuilder } from "./vpx-jspi-build-recipe.mjs";
assert.equal(process.platform, "linux");
const root = path.resolve(import.meta.dirname, "../.."), runtime = await createOwnedRuntimeScratch("vpx-jspi-builder-");
try {
  const builder = makeVpxJspiBuilder(await readFile(path.join(root, "media/ffmpeg/build-vpx-aac-candidate.mjs"), "utf8"));
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, builder.generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, windowsHide: true, stdio: "inherit",
    env: { ...runtime.env, WITHIN_PRIVATE_VPX_TIMELINE: "1" } });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) =>
    code === 0 ? resolve() : reject(new Error(`Private VPX JSPI build exit ${code}/${signal}`))); });
} finally { await runtime.close(); }
