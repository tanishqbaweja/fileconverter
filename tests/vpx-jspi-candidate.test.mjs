import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxJspiLink, VPX_JSPI_IMPORTS } from "../media/ffmpeg/vpx-jspi-candidate.mjs";
test("VPX JSPI candidate changes exactly suspension flags, preserving original codec/heap/I/O/thread settings", async () => {
  const source = await readFile("media/ffmpeg/build-remux.sh", "utf8"), result = makeVpxJspiLink(source);
  assert.equal(result.edits.length, 3); let restored = result.generated;
  for (const [before, after] of result.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source);
  assert.match(result.generated, /-sJSPI=1/);
  assert.match(result.generated, /-sJSPI_EXPORTS='\["within_remux"\]'/);
  assert.ok(result.generated.includes(`-sJSPI_IMPORTS='${JSON.stringify(VPX_JSPI_IMPORTS)}'`));
  assert.equal(VPX_JSPI_IMPORTS.length, 4);
  for (const key of ["codecSettingsChanged", "nativeWrapperChanged", "ioCallbacksChanged", "wasmMemoryLimitsChanged",
    "browserFlagsChanged", "browserFidelityVerified", "speedGainProven", "memoryAcceptance", "publicAcceptance"])
    assert.equal(result[key], false, key);
  assert.equal(result.engineManagedStackBytes, null);
  assert.equal(result.engineManagedMemoryIncludedInPrimaryMetric, true);
});
test("VPX JSPI link candidate refuses unpinned or modified parents", async () => {
  const source = await readFile("media/ffmpeg/build-remux.sh", "utf8");
  assert.throws(() => makeVpxJspiLink(source + "\n"));
  assert.throws(() => makeVpxJspiLink(source.replace("maximum_memory=100663296", "maximum_memory=201326592")));
});
