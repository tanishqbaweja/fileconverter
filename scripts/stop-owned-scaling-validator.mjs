// Explicit local cancellation of one CURRENT scaling validation child. Never
// kills the browser, harness, a process tree, or a name/path-matched bystander.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { lstat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 5);
const [mainText, childText, sourceText] = process.argv.slice(2);
assert.match(mainText, /^[1-9]\d*$/); assert.match(childText, /^[1-9]\d*$/);
const root = path.resolve(import.meta.dirname, ".."), source = await realpath(path.resolve(sourceText)), work = await realpath(path.join(root, "work"));
assert.equal(path.dirname(path.dirname(source)), work); assert.equal(path.basename(source), "within-test-scaled-hevc.mkv");
assert.ok((await lstat(source)).isFile());
const execute = promisify(execFile), shell = async code => (await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 16384 })).stdout.trim();
const query = async pid => JSON.parse(await shell(`$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $p) { 'null' } else { @{ pid = [int]$p.ProcessId; parentPid = [int]$p.ParentProcessId; createdAt = $p.CreationDate.ToUniversalTime().ToString('o'); executable = $p.ExecutablePath; commandLine = $p.CommandLine } | ConvertTo-Json -Compress }`));
const main = await query(mainText), child = await query(childText);
assert.ok(main && child); assert.equal(child.parentPid, main.pid);
assert.ok(main.commandLine.endsWith("scripts/qualify-mkv-direct-reuse.mjs --hevc-header-parser-scale-5gb 43691831594 0e2f2caa924413a1edc81c23c49c027dd952fec8"));
assert.equal(child.executable.toLowerCase(), "c:\\ffmpeg\\bin\\ffmpeg.exe");
assert.ok(child.commandLine.includes(`-i "${source}" -map 0:v:0 -map 0:a:0`));
assert.ok(child.commandLine.endsWith("-c:a pcm_s16le -progress pipe:1 -f streamhash -hash sha256 pipe:1"));
assert.match(child.createdAt, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/); assert.match(main.createdAt, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
const identity = p => ({ pid: p.pid, parentPid: p.parentPid, createdAt: p.createdAt,
  executable: p.executable, commandSha256: createHash("sha256").update(p.commandLine).digest("hex") });
const prefix = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-owned-scaling-validator-stop`;
const plan = { reason: "Projected two full content decodes exceed the fixed 20000-sample validation-phase journal; stop this owned validator to avoid a doomed run. Conversion peak sampling/fidelity gates are NOT relaxed.",
  main: identity(main), child: identity(child), source: path.relative(root, source).replaceAll(path.sep, "/"),
  scope: "ONE independently validated owned native validator birth only", processTreeKilled: false };
await writeFile(path.join(root, prefix + "-plan.json"), JSON.stringify(plan, null, 2) + "\n", { flag: "wx" });
const outcome = await shell(`$ErrorActionPreference = 'Stop'; $p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${child.pid}'; $m = Get-CimInstance Win32_Process -Filter 'ProcessId = ${main.pid}'; if ($null -eq $p) { 'already-absent' } elseif ($null -eq $m -or $p.ParentProcessId -ne ${main.pid} -or $p.CreationDate.ToUniversalTime().ToString('o') -ne '${child.createdAt}' -or $m.CreationDate.ToUniversalTime().ToString('o') -ne '${main.createdAt}') { throw 'Owned validator birth changed; refusing stop' } else { Stop-Process -Id ${child.pid} -ErrorAction Stop; 'stopped-exact-owned-validator' }`);
assert.ok(["already-absent", "stopped-exact-owned-validator"].includes(outcome));
await writeFile(path.join(root, prefix + ".json"), JSON.stringify({ ...plan, outcome, completedAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file: prefix + ".json", outcome }));
