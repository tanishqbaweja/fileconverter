// Preserve the source-audited header; add a real C bridge for archive callers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const headerSha = "b323eca8a8ae2d128b0056c4e3d5f5260aab615e1b297e81156bb864bd79e186";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const original = "EM_JS(void, within_hevc_aux_emit,";
const renamed = "EM_JS(void, within_hevc_aux_emit_js,";
const bridge = `
/* Native archive callers resolve this C symbol; its direct call retains EM_JS. */
void within_hevc_aux_emit(unsigned sequence, unsigned layer, unsigned active,
                          unsigned short_refs, unsigned long_refs, unsigned output,
                          const size_t *values)
{
    within_hevc_aux_emit_js(sequence, layer, active, short_refs, long_refs,
                           output, values);
}
`;
export function linkHevcAuxiliaryEmitter(header) {
  assert.equal(typeof header, "string"); assert.ok(Buffer.byteLength(header) <= 8192);
  assert.equal(sha(header), headerSha); assert.equal(header.split(original).length, 2);
  const linked = header.replace(original, renamed) + bridge;
  assert.equal(reverseHevcAuxiliaryEmitterLinkage(linked), header);
  return linked;
}
export function reverseHevcAuxiliaryEmitterLinkage(header) {
  assert.equal(typeof header, "string"); assert.ok(Buffer.byteLength(header) <= 8192);
  assert.ok(header.endsWith(bridge)); assert.equal(header.split(renamed).length, 2);
  const restored = header.slice(0, -bridge.length).replace(renamed, original);
  assert.equal(sha(restored), headerSha);
  return restored;
}
