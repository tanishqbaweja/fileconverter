#!/usr/bin/env node
// Cargo build wrapper only. Never a renderer, user-file reader or native converter.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { remappedRustcInvocation } from "./remap-contract.mjs";
assert.equal(process.platform, "linux");
const root = path.resolve(import.meta.dirname, "../..");
const invocation = remappedRustcInvocation(root, process.env, process.argv.slice(2));
assert.equal(await realpath(invocation.runtime), invocation.runtime);
assert.equal(await realpath(invocation.command), invocation.command);
const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: "inherit" });
const result = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
assert.equal(result.signal, null, "Interrupted compiler wrapper is never a completed build");
process.exitCode = result.code ?? 1;
