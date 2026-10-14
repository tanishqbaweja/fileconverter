// Private isolated Linux Emscripten build. Never installs into public engines.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeEbmlReuseHostedBuilder } from "./mpeg2-ebml-reuse-builder-recipe.mjs";
assert.equal(process.platform, "linux", "Use isolated hosted Emscripten, no Docker");
const root = path.resolve(import.meta.dirname, "../..");
const recipe = makeEbmlReuseHostedBuilder(await readFile(path.join(root, "media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("ebml-reuse-native-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs");
  await writeFile(file, recipe.generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`EBML reuse builder exit ${code}/${signal}`)));
  });
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
