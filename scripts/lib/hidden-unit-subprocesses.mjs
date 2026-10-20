// Unit-runner-only preload. Enforce the user's headless requirement, including
// Node's internal test-file subprocesses and nested native/compiler helpers.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

export function hiddenArguments(kind, args) {
  const result = [...args], index = kind === "exec" || kind === "execSync" ? 1 :
    Array.isArray(result[1]) || (result[1] == null && result.length > 2) ? 2 : 1;
  const options = result[index];
  if (typeof options === "function") result.splice(index, 0, { windowsHide: true });
  else if (options == null || typeof options === "object") result[index] = { ...options, windowsHide: true };
  // Preserve native rejection of invalid option primitives rather than repairing them.
  return result;
}

export function installHiddenUnitSubprocesses(api = childProcess) {
  for (const kind of ["spawn", "spawnSync", "fork", "exec", "execSync", "execFile", "execFileSync"]) {
    const original = api[kind];
    if (typeof original !== "function") continue;
    const wrapped = function (...args) { return original.apply(this, hiddenArguments(kind, args)); };
    if (original[promisify.custom]) Object.defineProperty(wrapped, promisify.custom, {
      value: function (...args) { return original[promisify.custom].apply(this, hiddenArguments(kind, args)); },
    });
    api[kind] = wrapped;
  }
  if (api === childProcess) syncBuiltinESMExports();
}
installHiddenUnitSubprocesses();
