// Extra bounded diagnostic census only. NEVER excludes or changes native bytes.
import assert from "node:assert/strict";
const birth = text => {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,7}))?Z$/.exec(text ?? "");
  assert.ok(m); return `${m[1]}.${(m[2] ?? "").padEnd(6, "0").slice(0, 6)}Z`;
};
export function matchOwnedBurstRole(root, observed, tree) {
  const liveRoot = tree.processes.filter(p => p.pid === root.pid);
  assert.equal(liveRoot.length, 1); assert.equal(birth(liveRoot[0].createdAt), birth(root.createdAt));
  const matches = tree.processes.filter(p => p.pid === observed.pid && p.parentPid === observed.parentPid && birth(p.createdAt) === birth(observed.createdAt));
  if (matches.length !== 1) return { status: "observed-birth-not-in-matching-census", type: null, utilitySubtype: null, sandboxType: null };
  const p = matches[0], field = v => typeof v === "string" && /^[a-zA-Z0-9_.-]{1,256}$/.test(v) ? v : null;
  return { status: "same-owned-root-and-child-birth-role-observed", type: field(p.type), utilitySubtype: field(p.utilitySubtype), sandboxType: field(p.sandboxType) };
}
