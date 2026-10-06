// Recognize only this immutable driver's first post-browser-completion native
// probe. No inference from a growing file, extension, lock or progress timer.
import assert from "node:assert/strict";
import path from "node:path";

export function simpleWindowsNativeArguments(commandLine) {
  assert.equal(typeof commandLine, "string"); assert.ok(commandLine.length <= 32768);
  const tokens = []; let offset = 0;
  while (offset < commandLine.length) {
    while (/\s/.test(commandLine[offset] ?? "") && offset < commandLine.length) offset++;
    if (offset === commandLine.length) break;
    let value;
    if (commandLine[offset] === '"') {
      const end = commandLine.indexOf('"', offset + 1); assert.ok(end > offset + 1, "Missing/empty quoted argument");
      value = commandLine.slice(offset + 1, end); assert.ok(!value.endsWith("\\"), "Escaped quote unsupported");
      offset = end + 1; assert.ok(offset === commandLine.length || /\s/.test(commandLine[offset]), "Ambiguous argument quoting");
    } else {
      const start = offset; while (offset < commandLine.length && !/\s/.test(commandLine[offset])) offset++;
      value = commandLine.slice(start, offset); assert.ok(!value.includes('"'), "Nested quoting unsupported");
    }
    assert.ok(!/[\r\n\0]/.test(value)); tokens.push(value); assert.ok(tokens.length <= 32);
  }
  return tokens;
}
export function closedOutputProbe(commandLine) {
  let args; try { args = simpleWindowsNativeArguments(commandLine); } catch { return null; }
  if (!/^ffprobe(?:\.exe)?$/i.test(path.win32.basename(args[0] ?? ""))) return null;
  const expected = ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_chapters", "-of", "json"];
  if (args.length !== expected.length + 2 || !expected.every((value, index) => args[index + 1] === value)) return null;
  return args.at(-1);
}
export function isFinalOutputDecode(commandLine, output) {
  let args; try { args = simpleWindowsNativeArguments(commandLine); } catch { return false; }
  if (!/^ffmpeg(?:\.exe)?$/i.test(path.win32.basename(args[0] ?? ""))) return false;
  const expected = ["-v", "error", "-xerror", "-i", output, "-map", "0:v", "-map", "0:a", "-f", "null", "-"];
  return args.length === expected.length + 1 && expected.every((value, index) => args[index + 1] === value);
}
