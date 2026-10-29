// Only a fresh, pinned, owned Cargo checkout; never the published engine.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { patchPinnedBlurBoundary } from "./blur-boundary-patch.mjs";
import { premultipliedTransferPatch } from "./premultiplied-transfer-patch.mjs";
import { pins, sha } from "./source-pins.mjs";
export async function patchOwnedBlurBoundary({ runtime, premultipliedProof, run }) {
  const root = path.resolve(import.meta.dirname, "../.."), directory = runtime.directory;
  assert.equal(path.dirname(directory), path.join(root, "work"));
  assert.match(path.basename(directory), /^resvg-source-compile-[A-Za-z0-9]{6}$/);
  assert.equal(await realpath(directory), directory);
  assert.equal(premultipliedProof.patchedSha256, premultipliedTransferPatch.patchedSha256);
  assert.equal(premultipliedProof.onlyOwnedFreshDependencyCheckoutChanged, true);
  const filterFile = premultipliedProof.ownedCargoSourceFile;
  assert.ok(filterFile.startsWith(path.join(directory, "cargo/git/checkouts") + path.sep));
  assert.ok(filterFile.endsWith(path.join("crates/resvg/src/filter/mod.rs")));
  assert.equal(await realpath(filterFile), filterFile);
  assert.equal(sha(await readFile(filterFile)), premultipliedTransferPatch.patchedSha256);
  assert.equal(await run("git", ["-C", path.dirname(filterFile), "rev-parse", "HEAD"], { capture: true }), pins.resvg);
  const file = path.join(path.dirname(filterFile), "box_blur.rs");
  assert.equal(await realpath(file), file);
  const identity = await lstat(file); assert.ok(identity.isFile() && !identity.isSymbolicLink());
  const result = patchPinnedBlurBoundary(await readFile(file), await readFile(path.join(root, "images/resvg-source/blur-boundary-entry.rs")));
  await writeFile(file, result.bytes);
  assert.equal(sha(await readFile(file)), result.proof.patchedSha256);
  return { ...result.proof, nativeSourceRecipeIntegrated: true, ownedCargoSourceFile: file,
    gitHead: pins.resvg, onlyOwnedFreshDependencyCheckoutChanged: true,
    priorPremultipliedSourceRetained: sha(await readFile(filterFile)) === premultipliedTransferPatch.patchedSha256 };
}
