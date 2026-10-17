// Fresh hosted Linux build; never writes public/ or changes historical builders.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeJspiHostedBuilder } from "./mpeg2-jspi-builder-recipe.mjs";
assert.equal(process.platform, "linux", "Use pinned hosted Emscripten, without Docker");
const root = path.resolve(import.meta.dirname, "../..");
const recipe = makeJspiHostedBuilder(await readFile(path.join(root, "media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), "utf8"), root);
const runtime = await createOwnedRuntimeScratch("jspi-native-builder-");
try {
  const file = path.join(runtime.directory, "builder.mjs"); await writeFile(file, recipe.generated, { flag: "wx" });
  const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`JSPI build exit ${code}/${signal}`)));
  });
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
