// Independent validator stdout only. Never a browser conversion or whole-file
// reader. At most one bounded stdout chunk plus a bounded unfinished line.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
/** @param {string} command @param {string[]} args @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} options */
export async function* boundedNativeLines(command, args, { cwd, env = process.env, timeoutMs = 600000 } = {}) {
  assert.ok(["ffprobe", "ffmpeg"].includes(command));
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 7200000);
  const controller = new AbortController(), decoder = new TextDecoder("utf-8", { fatal: true });
  const child = spawn(command, args, { cwd, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "", pending = "";
  const exit = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); exit.catch(() => {});
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-8192); });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for await (const chunk of child.stdout) {
      assert.ok(chunk.length <= 262144); pending += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, ""); pending = pending.slice(newline + 1);
        assert.ok(Buffer.byteLength(line) <= 4096, "Native validator line exceeded4KiB"); if (line) yield line;
      }
      assert.ok(Buffer.byteLength(pending) <= 4096, "Unfinished native validator line exceeded4KiB");
    }
    pending += decoder.decode(); assert.ok(Buffer.byteLength(pending) <= 4096); if (pending.trim()) yield pending.trim();
    assert.equal(await exit, 0, stderr);
  } finally {
    clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) controller.abort(); await exit.catch(() => {});
  }
}
export function parseCompactAacPacket(line) {
  assert.ok(typeof line === "string" && line.length <= 4096); const fields = line.split("|");
  assert.equal(fields.shift(), "packet"); assert.ok(fields.length <= 32);
  const values = {};
  for (const field of fields.filter(Boolean)) {
    const at = field.indexOf("="); assert.ok(at > 0); const key = field.slice(0, at).split(":").at(-1), value = field.slice(at + 1);
    assert.ok(["stream_index", "pts_time", "dts_time", "dts", "duration_time", "data_hash", "side_data_type", "skip_samples", "discard_padding"].includes(key), "Unexpected packet field");
    assert.equal(Object.hasOwn(values, key), false, "Duplicate packet/trim field"); values[key] = value;
  }
  assert.match(values.data_hash, /^SHA256:[a-f0-9]{64}$/);
  assert.ok(Object.hasOwn(values, "stream_index"));
  for (const key of ["pts_time", "dts_time"]) assert.ok(typeof values[key] === "string" && values[key].length > 0 && values[key] !== "N/A" && Number.isFinite(Number(values[key])));
  if (values.side_data_type !== undefined) assert.equal(values.side_data_type, "Skip Samples");
  const integer = key => { if (values[key] === undefined) return 0;
    assert.match(values[key], /^-?\d+$/); const value = Number(values[key]); assert.ok(Number.isSafeInteger(value)); return value; };
  const skip = integer("skip_samples"), tail = integer("discard_padding"); assert.ok(skip >= 0 && tail >= 0);
  if (values.side_data_type !== undefined) assert.ok(Object.hasOwn(values, "skip_samples") && Object.hasOwn(values, "discard_padding"));
  else assert.ok(!Object.hasOwn(values, "skip_samples") && !Object.hasOwn(values, "discard_padding"));
  const duration = values.duration_time === undefined || values.duration_time === "N/A" ? null : Number(values.duration_time);
  assert.ok(duration === null || (values.duration_time.length > 0 && Number.isFinite(duration) && duration > 0));
  return { streamIndex: integer("stream_index"), pts: Number(values.pts_time), dts: Number(values.dts_time),
    dtsTicks: values.dts === undefined || values.dts === "N/A" ? null : integer("dts"),
    duration,
    hash: values.data_hash, skip, tail, explicitTrim: values.side_data_type !== undefined };
}
