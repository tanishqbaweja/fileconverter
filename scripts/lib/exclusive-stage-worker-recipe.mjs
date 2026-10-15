// Additive private production-worker derivative. Historical worker stays exact.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { createExclusiveStagedWriter } from "./exclusive-staged-writer.mjs";
export function makeExclusiveStageWorker(source) {
  assert.equal(sha(source), "6349cbe78fe0c3ece7c7f285a4eb1f8b6a09155ab9a9f44319f9d12566791d68");
  const factory = createExclusiveStagedWriter.toString();
  const recipe = exactPatch(source, [
    ['const STAGED_MKV_COPY_CHUNK = 512 * 1024;', 'import { createExclusiveStagedWriter } from "../scripts/lib/exclusive-staged-writer.mjs";\nconst STAGED_MKV_COPY_CHUNK = 512 * 1024;'],
    ['  let finalWritable: FileSystemWritableFileStream | null = null;',
      '  let finalWritable: Pick<FileSystemWritableFileStream, "write" | "truncate" | "close" | "abort"> | null = null;'],
    ['        finalWritable = await finalHandle.createWritable({\n          keepExistingData: false,\n        });',
      '        finalWritable = createExclusiveStagedWriter(await finalHandle.createWritable({\n          keepExistingData: false,\n        }));'],
  ]);
  return { ...recipe, helperSha256: sha(factory), fixedCopyBufferBytes: 524288, maximumPendingWrites: 1,
    sourceReadWriteAndProgressLoopsChanged: false, codecSettingsChanged: false, heapLimitsChanged: false,
    publicAcceptance: false, fullOriginalAcceptance: false, primaryMemoryAcceptance: false, speedGainProven: false };
}
