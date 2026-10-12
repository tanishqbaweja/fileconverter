import assert from "node:assert/strict";
import { makePacketCacheRecipe } from "./mpeg2-packet-cache-recipe.mjs";
// Keep every C warning fatal. Only the SDK driver notes its redundant explicit
// maximum when growth is disabled; retain the note and BOTH fixed heap options.
export function makePacketCacheRecipeStrict(source) {
  const prior = makePacketCacheRecipe(source);
  const before = "-O2 -Wall -Wextra -Werror -UNDEBUG -pthread", after = "-O2 -Wall -Wextra -Werror -Wno-error=unused-command-line-argument -UNDEBUG -pthread";
  assert.equal(prior.split(before).length, 2);
  const generated = prior.replace(before, after); assert.equal(generated.replace(after, before), prior);
  return generated;
}
