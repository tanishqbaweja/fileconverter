// Isolated SDK source override; never touch the user's installed toolchain.
// Emscripten itself supports MALLOC_ALIGNMENT overrides. The ordinary/free ABI
// remains upstream, not an interior-pointer shim or reference-lifetime change.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
export const SDK_DLMALLOC_SOURCE_SHA256 = "175ef7cab6d59b858471ad8ba16ee8a2f0536ddf666742b5e044b187171695d6";
const prefix = "/* Private decoder-only override; upstream allocator body unchanged. */\n#define MALLOC_ALIGNMENT 16\n";
export function makeAlignment16SdkSource(source) {
  assert.equal(sha(source), SDK_DLMALLOC_SOURCE_SHA256); assert.equal(Buffer.byteLength(source), 236570);
  assert.ok(source.startsWith("\n/* XXX Emscripten XXX */"));
  assert.ok(source.includes("#ifndef MALLOC_ALIGNMENT")); assert.ok(source.includes("_Static_assert(MALLOC_ALIGNMENT == 8"));
  const generated = prefix + source; assert.equal(generated.slice(prefix.length), source);
  return { generated, generatedSha256: sha(generated), originalSha256: sha(source), prefix, alignment: 16,
    upstreamBodyUnchanged: true, heapLimitsRaised: false, runtimeFixProven: false };
}
async function target(root, file) {
  const sdk = path.join(root, "work/emsdk"), expected = path.join(sdk, "upstream/emscripten/system/lib/dlmalloc.c");
  assert.equal(file, expected); assert.equal(await realpath(file), expected); const identity = await lstat(file, { bigint: true });
  assert.ok(identity.isFile() && !identity.isSymbolicLink()); return identity;
}
export async function patchAlignment16Sdk(root, stateFile) {
  assert.equal(process.platform, "linux"); assert.equal(path.dirname(path.dirname(stateFile)), path.join(root, "work"));
  assert.match(path.basename(path.dirname(stateFile)), /^alignment16-builder-[A-Za-z0-9]+$/);
  const file = path.join(root, "work/emsdk/upstream/emscripten/system/lib/dlmalloc.c"), identity = await target(root, file);
  const source = await readFile(file, "utf8"), recipe = makeAlignment16SdkSource(source);
  const state = { file, originalSha256: recipe.originalSha256, generatedSha256: recipe.generatedSha256,
    originalBase64: Buffer.from(source).toString("base64"), dev: identity.dev.toString(), ino: identity.ino.toString() };
  await writeFile(stateFile, JSON.stringify(state), { flag: "wx" });
  try {
    await writeFile(file, recipe.generated); assert.equal(sha(await readFile(file)), recipe.generatedSha256);
  } catch (error) {
    // A failed/truncated write is ours, but only undo it on the same inode.
    try {
      const current = await target(root, file); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
      await writeFile(file, source); assert.equal(sha(await readFile(file)), recipe.originalSha256);
    } catch (rollbackError) { throw new AggregateError([error, rollbackError], `SDK rollback failed; preserve backup ${stateFile}`); }
    throw error;
  }
  return recipe;
}
export async function restoreAlignment16Sdk(root, stateFile) {
  assert.equal(process.platform, "linux"); assert.equal(path.dirname(path.dirname(stateFile)), path.join(root, "work"));
  assert.match(path.basename(path.dirname(stateFile)), /^alignment16-builder-[A-Za-z0-9]+$/);
  const stateBytes = await readFile(stateFile); assert.ok(stateBytes.length <= 524288); const state = JSON.parse(stateBytes), original = Buffer.from(state.originalBase64, "base64");
  assert.equal(sha(original), SDK_DLMALLOC_SOURCE_SHA256); assert.equal(state.originalSha256, SDK_DLMALLOC_SOURCE_SHA256);
  const identity = await target(root, state.file); assert.equal(identity.dev.toString(), state.dev); assert.equal(identity.ino.toString(), state.ino);
  const current = sha(await readFile(state.file)); assert.ok([state.originalSha256, state.generatedSha256].includes(current));
  if (current !== state.originalSha256) await writeFile(state.file, original);
  assert.equal(sha(await readFile(state.file)), state.originalSha256); return { upstreamSourceRestored: true, sourceSha256: state.originalSha256 };
}
if (path.resolve(process.argv[1] ?? "") === import.meta.filename) {
  assert.equal(process.argv.length, 4); assert.equal(process.argv[2], "restore");
  await restoreAlignment16Sdk(path.resolve(import.meta.dirname, "../.."), path.resolve(process.argv[3]));
}
