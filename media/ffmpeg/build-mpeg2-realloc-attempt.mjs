// Explicit isolated Linux no-Docker builder; never mutate the published cores.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeReallocHostedBuilder } from "./mpeg2-realloc-builder-recipe.mjs";
assert.equal(process.platform, "linux", "Use isolated hosted no-Docker Emscripten build");
const root = path.resolve(import.meta.dirname, "../.."), source = await readFile(path.join(root, "media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), "utf8");
const recipe = makeReallocHostedBuilder(source, root), runtime = await createOwnedRuntimeScratch("realloc-native-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) =>
    code === 0 ? resolve() : reject(new Error(`Realloc native builder exit ${code}/${signal}`))); });
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
