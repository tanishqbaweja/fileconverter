// Diagnostic subprocess ONLY. Model a checkout without untracked work artifacts.
// Never imported into a conversion, browser, build, or production test harness.
import promises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncBuiltinESMExports } from "node:module";
const root = path.resolve(import.meta.dirname, "../.."), privateRoot = path.join(root, "work");
const original = promises.readFile;
promises.readFile = async function (file, ...args) {
  const name = file instanceof URL ? fileURLToPath(file) : typeof file === "string" ? file : null;
  if (name) {
    const absolute = path.resolve(name), relative = path.relative(privateRoot, absolute);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      const error = Object.assign(new Error(`CI_PRIVATE_WORK_PROBE: untracked private artifact absent: ${absolute}`),
        { code: "ENOENT", path: absolute });
      error.stack = error.message; throw error;
    }
  }
  return original.call(this, file, ...args);
};
syncBuiltinESMExports();
