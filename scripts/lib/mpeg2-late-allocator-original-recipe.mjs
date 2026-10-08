// Preserve actual quiesced full-source gates; only proven fatal observer/core binding changes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeQuiescedBudgetDriver } from "./mpeg2-quiesced-budget-recipe.mjs";
import { makeAbortSplitAdapter } from "./mpeg2-abort-original-recipe.mjs";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
export function makeLateAllocatorOriginalDriver(source,root,resolvePackage,adapter,helper,traceHelperUrl,lateAdapter) {
  const prior=makeQuiescedBudgetDriver(source,root,resolvePackage,adapter,helper,traceHelperUrl);
  const previousAdapter=makeAbortSplitAdapter(adapter,helper);
  assert.ok(typeof lateAdapter==="string"&&Buffer.byteLength(lateAdapter)<32768);
  assert.doesNotMatch(lateAdapter,/control_pool_|control_unref|synthetic-oom/);
  assert.match(lateAdapter,/actualAllocatorRoot: 1786520/);
  const patches=[
    ['for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(await shaFile(path.join(root, file)), hash);',
      `for (const [file, hash] of Object.entries(manifest.sources)) {
  if(file===".github/workflows/reproduce-ffmpeg-nondocker.yml") {
    const canonical=await readFile(path.join(root,file),"utf8");
    assert.equal(createHash("sha256").update(canonical).digest("hex"),"cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965");
    assert.equal(hash,"d280472ff4421e744aa767d9d690a7b73d82a26951bb71446c3fb3d55cacd78d");
    assert.equal(createHash("sha256").update(makeLateSlotBuildWorkflow(canonical)).digest("hex"),hash);
  } else assert.equal(await shaFile(path.join(root,file)),hash,file);
}`],
    ["scripts/stage-mpeg2-split-abort-diagnostic.mjs","scripts/stage-mpeg2-late-allocator-abort.mjs"],
    [`assert.equal((await stat(file)).size,${Buffer.byteLength(previousAdapter)});`,
      `assert.equal((await stat(file)).size,${Buffer.byteLength(lateAdapter)});`],
    [sha(previousAdapter),sha(lateAdapter)],
    [`bytes:${Buffer.byteLength(previousAdapter)},sha256:`, `bytes:${Buffer.byteLength(lateAdapter)},sha256:`],
    ['const sourceFiles = ["scripts/mpeg2-quiesced-budget-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-late-allocator-original-memory.mjs","scripts/lib/mpeg2-late-allocator-original-recipe.mjs",\n'+
      '"scripts/lib/mpeg2-late-allocator-abort-adapter.mjs","scripts/lib/late-pool-allocator-abort-capture.mjs","scripts/lib/dlmalloc-free-header-inspection.mjs",\n'+
      '"scripts/lib/mpeg2-late-abort-adapter.mjs","scripts/lib/late-pool-abort-capture.mjs","scripts/lib/late-refstruct-abort-snapshot.mjs","scripts/lib/late-slot-build-workflow.mjs",\n'+
      '"scripts/stage-mpeg2-late-allocator-abort.mjs","scripts/check-late-pool-allocator-abort-control.mjs",\n'+
      '"evidence/late-pool-allocator-abort-control-2026-10-08.json","evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json",\n'+
      '"scripts/validate-mpeg2-late-allocator-abort-goldens.mjs","scripts/freeze-mpeg2-late-allocator-abort-goldens.mjs",\n'+
      '"evidence/mpeg2-late-allocator-abort-golden-validation-2026-10-08.json","scripts/mpeg2-quiesced-budget-memory.mjs",'],
    ['-private-mpeg2-quiesced-budget-native-100ms','-private-mpeg2-late-allocator-original-native-100ms'],
    ['"mpeg2-quiesced-budget-runtime-"','"mpeg2-late-allocator-original-runtime-"'],
    ['Full protected original with equivalent flex CSS/proven staged abort observer;',
      'Full protected original with equivalent flex CSS/compiled3e744 pending-pool and bounded allocator-header fatal observer;'],
  ];
  let result=prior;
  for(const[before,after]of patches){assert.ok(result.includes(before),before);result=result.replaceAll(before,after);}
  let reverse=result;
  for(const[before,after]of patches.toReversed())reverse=reverse.replaceAll(after,before);
  assert.equal(reverse,prior,"Full original/disk/SHA/codec/quality/250MiB/blank/repeats/validators/cancel/cleanup gates unchanged");
  return `import {makeLateSlotBuildWorkflow} from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/late-slot-build-workflow.mjs")).href)};\n`+result;
}
