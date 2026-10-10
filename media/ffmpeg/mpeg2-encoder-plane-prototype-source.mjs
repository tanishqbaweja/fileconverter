// One compiler-only declaration atop the actual failed source, policy unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export const FAILED_PLANE_BUFFER_SHA256 = "d8f4da7a856ef0e2221bb4dc715a20a21dbf8b7b7b16527c34f742941eb10b56";
export const PRIVATE_PLANE_FACTORY_DECLARATION = "AVBufferPool *ff_within_mpeg2_single_idle_plane_pool(size_t size);\n\n";
const definition = "AVBufferPool *ff_within_mpeg2_single_idle_plane_pool(size_t size)\n{";
export function reversePlaneFactoryPrototype(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  const added = PRIVATE_PLANE_FACTORY_DECLARATION + definition;
  assert.equal(source.split(added).length, 2);
  const restored = source.replace(added, definition); assert.equal(sha(restored), FAILED_PLANE_BUFFER_SHA256);
  return restored;
}
export function applyPlaneFactoryPrototype(source) {
  assert.equal(typeof source, "string"); assert.ok(Buffer.byteLength(source) <= 32768);
  assert.equal(sha(source), FAILED_PLANE_BUFFER_SHA256); assert.equal(source.split(definition).length, 2);
  const changed = source.replace(definition, PRIVATE_PLANE_FACTORY_DECLARATION + definition);
  assert.equal(reversePlaneFactoryPrototype(changed), source); return changed;
}
