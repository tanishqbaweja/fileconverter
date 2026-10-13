import assert from "node:assert/strict";
import { makePacketCacheRecipeStrict } from "./mpeg2-packet-cache-strict-recipe.mjs";
export function makeLargestIdleRecipe(source) {
  const prior = makePacketCacheRecipeStrict(source);
  const start = prior.indexOf('emcc "${SCRIPT_DIR}/mpeg2-packet-cache-smoke.c"');
  const end = prior.indexOf('# Compile the preserved production AVIO/kernel', start);
  assert.ok(start >= 0 && end > start);
  const oldSmoke = prior.slice(start, end);
  const common = oldSmoke.replaceAll("mpeg2-packet-cache-smoke.c", "mpeg2-packet-largest-idle-smoke.c");
  const candidate = common.replace(" -UNDEBUG -pthread", " -DWITHIN_LARGEST_IDLE -UNDEBUG -pthread");
  assert.notEqual(candidate, common);
  const control = common.replaceAll("packet-cache-smoke", "packet-first-idle-smoke");
  const generated = prior.replace(oldSmoke, candidate + control)
    .replace("make-mpeg2-packet-cache-pipeline.mjs", "make-mpeg2-packet-largest-idle-pipeline.mjs");
  assert.equal(generated.replace(candidate + control, oldSmoke)
    .replace("make-mpeg2-packet-largest-idle-pipeline.mjs", "make-mpeg2-packet-cache-pipeline.mjs"), prior);
  return generated;
}
