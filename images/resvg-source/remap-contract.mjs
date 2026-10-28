// Deterministic source-location names, not codec/quality or allocator settings.
import assert from "node:assert/strict";
import path from "node:path";
import { pins } from "./source-pins.mjs";
export const remappedSourceRoot = "/within/resvg-build";
export function remappedRustcInvocation(root, environment, args) {
  assert.ok(args.length > 0 && args.length <= 256);
  const hostToolchain = pins.compilerToolchain + "-x86_64-unknown-linux-gnu";
  assert.ok([pins.compilerToolchain, hostToolchain].includes(environment.RUSTUP_TOOLCHAIN), "Only the exact short or host-qualified pinned nightly is allowed");
  const cargoHome = environment.CARGO_HOME; assert.ok(typeof cargoHome === "string" && path.posix.isAbsolute(cargoHome));
  const runtime = path.posix.dirname(cargoHome);
  assert.equal(path.posix.dirname(runtime), path.posix.join(root, "work"));
  assert.match(path.posix.basename(runtime), /^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(cargoHome, path.posix.join(runtime, "cargo"));
  const rustc = path.posix.join(runtime, "rustup/toolchains", hostToolchain, "bin/rustc");
  assert.equal(args[0], rustc, "Cargo must invoke the exact compiler installed in this owned compile runtime");
  assert.equal(environment.RUSTUP_HOME, path.posix.join(runtime, "rustup"));
  assert.equal(environment.RUSTFLAGS ?? "", ""); assert.equal(environment.CARGO_ENCODED_RUSTFLAGS ?? "", "");
  assert.equal(environment.RUSTC_WORKSPACE_WRAPPER ?? "", "");
  assert.ok(!args.slice(1).some(value => value.startsWith("--remap-path-prefix")), "No competing source-path remap");
  return { runtime, command: rustc, args: [`--remap-path-prefix=${runtime}=${remappedSourceRoot}`, ...args.slice(1)] };
}
