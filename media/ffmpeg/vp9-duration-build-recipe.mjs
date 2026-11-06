// Isolated private build. Published reproduction scripts and source stay exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVp9DurationBuildRecipe(source, { temporalFilterGuard = false, allocationDiagnostics = false, lazyUtility = false, tokenContext = false, tokenPacked = false } = {}) {
  assert.equal(typeof temporalFilterGuard, "boolean");
  assert.equal(typeof allocationDiagnostics, "boolean"); assert.ok(!allocationDiagnostics || temporalFilterGuard);
  assert.equal(typeof lazyUtility,"boolean");assert.ok(!lazyUtility||allocationDiagnostics);
  assert.equal(typeof tokenContext,"boolean");assert.ok(!tokenContext||lazyUtility);
  assert.equal(typeof tokenPacked,"boolean");assert.ok(!tokenPacked||tokenContext);
  assert.equal(sha(source), "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e");
  const tail = source.slice(source.indexOf("comparison_files=()\n"));
  assert.ok(tail.startsWith("comparison_files=()\n") && tail.endsWith("printf 'Exact non-Docker FFmpeg artifact comparison passed.\\n'\n"));
  const link = "  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh\n";
  const edits = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_VP9_DURATION_SCRIPT_DIR:?Explicit repository source directory required}"'],
    ['${WORK_ROOT}/ffmpeg-nondocker-build', '${WORK_ROOT}/vp9-duration-build'],
    ['${WORK_ROOT}/ffmpeg-nondocker-output', '${WORK_ROOT}/vp9-duration-output'],
    ['KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"', 'KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"\n[[ "${WITHIN_BUILD_CORE_FILTER:-}" == "within-remux" && "${KEEP_OUTPUT}" == "1" ]] || exit 2'],
    ['curl --fail --location --retry 3 "${url}" --output "${archive}"',
      'curl --fail --location --retry 3 --retry-all-errors --retry-delay 2 --retry-max-time 180 --connect-timeout 20 --max-time 120 "${url}" --output "${archive}"'],
    [link, '  cp -- "${BUILD_ROOT}/within_remux.c" "${BUILD_ROOT}/within_remux.base.c"\n' +
      '  node "${SCRIPT_DIR}/make-vp9-duration-source.mjs"\n' +
      '  cp -- "${BUILD_ROOT}/within_remux.duration.c" "${BUILD_ROOT}/within_remux.c"\n' + link +
      '  cp -- "${BUILD_ROOT}/within_remux.base.c" "${OUTPUT_ROOT}/within_remux.base.c"\n' +
      '  cp -- "${BUILD_ROOT}/within_remux.duration.c" "${OUTPUT_ROOT}/within_remux.duration.c"\n' +
      '  cp -- "${BUILD_ROOT}/vp9-duration-source-proof.json" "${OUTPUT_ROOT}/vp9-duration-source-proof.json"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/COPYING.LGPLv3" "${OUTPUT_ROOT}/LICENSE.ffmpeg-lgpl3"\n' +
      '  cp -- "${BUILD_ROOT}/libvpx/LICENSE" "${OUTPUT_ROOT}/LICENSE.libvpx"\n'],
    [tail, "# Private changed native source: NOT a public artifact reproduction claim.\nprintf 'Private VP9 duration candidate compiled; browser gates remain pending.\\n'\n"],
  ];
  if (temporalFilterGuard) edits.push(["./build-vpx.sh\n",
    'node "${SCRIPT_DIR}/make-vp9-temporal-filter-source.mjs"\n./build-vpx.sh\n' +
    'cp -- "${BUILD_ROOT}/vp9_encoder.temporal.base.c" "${OUTPUT_ROOT}/vp9_encoder.temporal.base.c"\n' +
    'cp -- "${BUILD_ROOT}/vp9_encoder.temporal.guard.c" "${OUTPUT_ROOT}/vp9_encoder.temporal.guard.c"\n' +
    'cp -- "${BUILD_ROOT}/vp9-temporal-filter-source-proof.json" "${OUTPUT_ROOT}/vp9-temporal-filter-source-proof.json"\n']);
  if (allocationDiagnostics) edits.push([
    'node "${SCRIPT_DIR}/make-vp9-temporal-filter-source.mjs"\n./build-vpx.sh\n',
    'node "${SCRIPT_DIR}/make-vp9-temporal-filter-source.mjs"\nnode "${SCRIPT_DIR}/make-vp9-allocation-diagnostic-source.mjs"\n./build-vpx.sh\nnode "${SCRIPT_DIR}/probe-vp9-allocation-link.mjs"\n' +
    'cp -- "${BUILD_ROOT}/vp9_encoder.allocation.diagnostic.c" "${OUTPUT_ROOT}/vp9_encoder.allocation.diagnostic.c"\n' +
    'cp -- "${BUILD_ROOT}/yv12config.allocation.base.c" "${OUTPUT_ROOT}/yv12config.allocation.base.c"\n' +
    'cp -- "${BUILD_ROOT}/yv12config.allocation.diagnostic.c" "${OUTPUT_ROOT}/yv12config.allocation.diagnostic.c"\n' +
    'cp -- "${BUILD_ROOT}/vp9-allocation-diagnostic-proof.json" "${OUTPUT_ROOT}/vp9-allocation-diagnostic-proof.json"\n' +
    'cp -- "${BUILD_ROOT}/build-libraries.allocation.base.sh" "${OUTPUT_ROOT}/build-libraries.allocation.base.sh"\n' +
    'cp -- "${BUILD_ROOT}/build-libraries.allocation.diagnostic.sh" "${OUTPUT_ROOT}/build-libraries.allocation.diagnostic.sh"\n' +
    'cp -- "${BUILD_ROOT}/vp9-allocation-link-proof.json" "${OUTPUT_ROOT}/vp9-allocation-link-proof.json"\n']);
  if(lazyUtility)edits.push([
    'node "${SCRIPT_DIR}/make-vp9-allocation-diagnostic-source.mjs"\n./build-vpx.sh\n',
    'node "${SCRIPT_DIR}/make-vp9-allocation-diagnostic-source.mjs"\nnode "${SCRIPT_DIR}/make-vp9-lazy-utility-source.mjs"\n./build-vpx.sh\n'+
    'cp -- "${BUILD_ROOT}/vp9_encoder.lazy.utility.c" "${OUTPUT_ROOT}/vp9_encoder.lazy.utility.c"\n'+
    'cp -- "${BUILD_ROOT}/vp9_picklpf.lazy.base.c" "${OUTPUT_ROOT}/vp9_picklpf.lazy.base.c"\n'+
    'cp -- "${BUILD_ROOT}/vp9_picklpf.lazy.utility.c" "${OUTPUT_ROOT}/vp9_picklpf.lazy.utility.c"\n'+
    'cp -- "${BUILD_ROOT}/vp9-lazy-utility-proof.json" "${OUTPUT_ROOT}/vp9-lazy-utility-proof.json"\n']);
  if(tokenContext)edits.push([
    'node "${SCRIPT_DIR}/make-vp9-lazy-utility-source.mjs"\n./build-vpx.sh\n',
    'node "${SCRIPT_DIR}/make-vp9-lazy-utility-source.mjs"\nnode "${SCRIPT_DIR}/make-vp9-token-context-source.mjs"\n./build-vpx.sh\n'+
    'node "${SCRIPT_DIR}/make-vp9-token-context-source.mjs" --layout\n'+
    ['vp9_tokenize.header.base.c','vp9_tokenize.header.compact.c','vp9_tokenize.producer.base.c','vp9_tokenize.producer.compact.c',
      'vp9_bitstream.packer.base.c','vp9_bitstream.packer.compact.c','vp9-token-context-proof.json',
      'vp9-token-vpx-config.h','vp9-token-layout-probe.c','vp9-token-layout-probe.ll']
      .map(file=>'cp -- "${BUILD_ROOT}/'+file+'" "${OUTPUT_ROOT}/'+file+'"\n').join('')]);
  if(tokenPacked)edits.push([
    'node "${SCRIPT_DIR}/make-vp9-token-context-source.mjs"\n./build-vpx.sh\nnode "${SCRIPT_DIR}/make-vp9-token-context-source.mjs" --layout\n',
    'node "${SCRIPT_DIR}/make-vp9-token-context-source.mjs"\nnode "${SCRIPT_DIR}/make-vp9-token-packed-source.mjs"\n./build-vpx.sh\nnode "${SCRIPT_DIR}/make-vp9-token-packed-source.mjs" --layout\n'+
    ['vp9_tokenize.header.packed.c','vp9_tokenize.producer.packed.c','vp9_bitstream.packer.packed.c','vp9-token-packed-proof.json',
      'vp9-packed-vpx-config.h','vp9-packed-layout-probe.c','vp9-packed-layout-probe.ll']
      .map(file=>'cp -- "${BUILD_ROOT}/'+file+'" "${OUTPUT_ROOT}/'+file+'"\n').join('')]);
  if(tokenPacked)for(const file of ['vp9-token-vpx-config.h','vp9-token-layout-probe.c','vp9-token-layout-probe.ll'])edits.push([
    'cp -- "${BUILD_ROOT}/'+file+'" "${OUTPUT_ROOT}/'+file+'"\n',
    '# Packed build retains its own actual configured layout, not the six-byte ancestor probe ('+file+').\n']);
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(source), edits,
    dependencyRecipesChanged: temporalFilterGuard, boundedTransportRetriesChanged: true, compilerSettingsChanged: allocationDiagnostics, productionFinalLinkFlagsChanged: false, memoryLimitsRaised: false,
    temporalFilterGuard, vendorAllocationOnlyChanged: temporalFilterGuard,
    allocationDiagnostics, diagnosticsOnFailureOnly: allocationDiagnostics,
    lazyUtility,
    tokenContext,
    tokenPacked,
    allCoreBuildSelected: false, publicAcceptance: false };
}
