// Private suspension-only candidate. Does not alter or build any public core.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const VPX_JSPI_LINK_PARENT_SHA256 = "904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e";
export const VPX_JSPI_IMPORTS = Object.freeze([
  "within_input_read", "within_output_write", "within_output_truncate", "within_output_flush",
]);
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVpxJspiLink(source) {
  assert.equal(sha(source), VPX_JSPI_LINK_PARENT_SHA256, "Only the exact audited link parent is eligible");
  const edits = [
    ["    -sASYNCIFY=1 \\\n", "    -sJSPI=1 \\\n"],
    ["    -sASYNCIFY_STACK_SIZE=1048576 \\\n", "    -sJSPI_EXPORTS='[\"within_remux\"]' \\\n"],
    [`    -sASYNCIFY_IMPORTS='${JSON.stringify(VPX_JSPI_IMPORTS)}' \\\n`,
      `    -sJSPI_IMPORTS='${JSON.stringify(VPX_JSPI_IMPORTS)}' \\\n`],
  ];
  let generated = source;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after);
  }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) {
    assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before);
  }
  assert.equal(reverse, source); assert.doesNotMatch(generated, /-sASYNCIFY/);
  return { generated, generatedSha256: sha(generated), parentSha256: VPX_JSPI_LINK_PARENT_SHA256, edits,
    scope: "private-VPX-suspension-only-link-candidate-not-built",
    codecSettingsChanged: false, nativeWrapperChanged: false, ioCallbacksChanged: false,
    wasmMemoryLimitsChanged: false, browserFlagsChanged: false,
    engineManagedStackBytes: null, engineManagedMemoryIncludedInPrimaryMetric: true,
    browserFidelityVerified: false, speedGainProven: false, memoryAcceptance: false, publicAcceptance: false };
}
